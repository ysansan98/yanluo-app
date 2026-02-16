import type {
  AsrFinalResponse,
  AudioCapture,
  HotkeyManager,
  PermissionChecker,
  SessionOrchestrator,
  StreamingAsrClient,
  TextInjector,
  VoiceError,
  VoiceSessionMetrics,
  VoiceSessionState,
} from './types'
import { VOICE_TIMEOUT } from './types'

interface SessionOrchestratorDeps {
  hotkeyManager: HotkeyManager
  audioCapture: AudioCapture
  asrClient: StreamingAsrClient
  textInjector: TextInjector
  permissionChecker: PermissionChecker
  enableHotkey?: boolean
  onUiShow?: (payload: { sessionId: string, status: 'arming' | 'recording' | 'finalizing' }) => void
  onUiUpdate?: (payload: {
    sessionId: string
    status: 'recording' | 'finalizing'
    partialText: string
    elapsedMs: number
  }) => void
  onUiFinal?: (payload: { sessionId: string, finalText: string, mode: 'pasted' | 'clipboard' }) => void
  onUiHide?: () => void
  onUiToast?: (payload: { type: 'info' | 'success' | 'warning' | 'error', message: string }) => void
  log?: (message: string, extra?: Record<string, unknown>) => void
}

interface ActiveSession {
  sessionId: string
  state: VoiceSessionState
  metrics: VoiceSessionMetrics
  partialText: string
  finalText: string
  carryPrefix: string
}

function createSessionId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class DefaultSessionOrchestrator implements SessionOrchestrator {
  private readonly log: (message: string, extra?: Record<string, unknown>) => void

  private session: ActiveSession | null = null
  private state: VoiceSessionState = 'IDLE'

  private waitFinalResolver: ((value: AsrFinalResponse | null) => void) | null = null
  private waitFinalTimer: NodeJS.Timeout | null = null
  private continueTimer: NodeJS.Timeout | null = null
  private continuingSessionId: string | null = null
  private failing = false
  private hotkeyBound = false
  private readonly preemptedSessionIds = new Set<string>()
  private pendingCarryText = ''
  private pendingCarryAt: number | null = null
  private continueWindowMs: number = VOICE_TIMEOUT.CONTINUE_WINDOW_MS

  constructor(private readonly deps: SessionOrchestratorDeps) {
    this.log = deps.log ?? ((message, extra) => console.info(`[voice-session] ${message}`, extra ?? {}))
  }

  async init(): Promise<void> {
    this.bindEvents()
    if (this.deps.enableHotkey ?? true) {
      await this.deps.hotkeyManager.start()
      this.hotkeyBound = true
    }
    this.log('initialized')
  }

  async dispose(): Promise<void> {
    await this.cleanupSession('dispose')
    if (this.hotkeyBound) {
      await this.deps.hotkeyManager.stop()
      this.hotkeyBound = false
    }
    this.state = 'IDLE'
    this.log('disposed')
  }

  getContinueWindowMs(): number {
    return this.continueWindowMs
  }

  setContinueWindowMs(ms: number): void {
    const next = Number.isFinite(ms) ? Math.round(ms) : VOICE_TIMEOUT.CONTINUE_WINDOW_MS
    this.continueWindowMs = Math.min(8000, Math.max(200, next))
    this.log('continue window updated', { continueWindowMs: this.continueWindowMs })
  }

  async handleHotkeyPress(): Promise<void> {
    if (this.state === 'FINALIZING' && this.session && this.continuingSessionId === this.session.sessionId) {
      const sessionId = this.session.sessionId
      if (this.continueTimer) {
        clearTimeout(this.continueTimer)
        this.continueTimer = null
      }
      this.continuingSessionId = null
      await this.deps.audioCapture.start()
      this.transition('STREAMING', { sessionId, resumed: true })
      this.deps.onUiUpdate?.({
        sessionId,
        status: 'recording',
        partialText: this.session.partialText,
        elapsedMs: Date.now() - this.session.metrics.startedAt,
      })
      return
    }

    if (this.state !== 'IDLE') {
      this.log('hotkey press preempting active session', {
        state: this.state,
        sessionId: this.session?.sessionId ?? '',
      })
      await this.preemptActiveSession('hotkey-restart')
    }

    if (this.state !== 'IDLE') {
      this.log('ignored hotkey press because state is still busy', { state: this.state })
      return
    }

    const sessionId = createSessionId()
    if (this.preemptedSessionIds.size > 16) {
      this.preemptedSessionIds.clear()
    }
    const now = Date.now()
    const carryPrefix = this.shouldMergeCarryAt(now) ? this.pendingCarryText.trim() : ''
    this.clearPendingCarry()
    this.session = {
      sessionId,
      state: 'ARMING',
      partialText: '',
      finalText: '',
      carryPrefix,
      metrics: {
        sessionId,
        startedAt: now,
      },
    }
    this.transition('ARMING', { sessionId })
    this.deps.onUiShow?.({ sessionId, status: 'arming' })

    try {
      const micPermission = await this.deps.permissionChecker.ensureOrPrompt('MICROPHONE')
      if (micPermission === 'DENIED' || micPermission === 'RESTRICTED') {
        throw this.makeError('E_MIC_PERMISSION', `Microphone permission is ${micPermission.toLowerCase()}`)
      }

      await this.deps.asrClient.connect()
      await this.deps.asrClient.start({
        sessionId,
        sampleRate: 16000,
        language: 'auto',
      })
      await this.deps.audioCapture.start()

      this.transition('STREAMING', { sessionId })
      this.deps.onUiUpdate?.({
        sessionId,
        status: 'recording',
        partialText: '',
        elapsedMs: Date.now() - (this.session?.metrics.startedAt ?? Date.now()),
      })
    }
    catch (error) {
      await this.fail(error, 'handleHotkeyPress', sessionId)
    }
  }

  async handleHotkeyRelease(): Promise<void> {
    if (this.state === 'ARMING') {
      await this.cleanupSession('release-in-arming')
      this.transition('IDLE')
      return
    }

    if (this.state !== 'STREAMING') {
      this.log('ignored hotkey release due to state guard', { state: this.state })
      return
    }

    const session = this.session
    if (!session) {
      await this.fail(this.makeError('E_ASR_CONNECT', 'Missing active session on release'), 'release-no-session')
      return
    }
    const sessionId = session.sessionId

    try {
      this.transition('FINALIZING', { sessionId: session.sessionId })
      this.deps.onUiUpdate?.({
        sessionId: session.sessionId,
        status: 'finalizing',
        partialText: session.partialText,
        elapsedMs: Date.now() - session.metrics.startedAt,
      })
      await this.deps.audioCapture.stop()
      this.continuingSessionId = sessionId
      this.continueTimer = setTimeout(() => {
        void this.finalizeSession(sessionId)
      }, this.continueWindowMs)
    }
    catch (error) {
      if (!this.isSessionCurrent(sessionId)) {
        this.log('ignore release error from stale session', { sessionId })
        return
      }
      await this.fail(error, 'handleHotkeyRelease', sessionId)
    }
  }

  private bindEvents(): void {
    if (this.deps.enableHotkey ?? true) {
      this.deps.hotkeyManager.onPress(() => {
        void this.handleHotkeyPress()
      })
      this.deps.hotkeyManager.onRelease(() => {
        void this.handleHotkeyRelease()
      })
      this.deps.hotkeyManager.onError((err) => {
        void this.fail(err, 'hotkey-error')
      })
    }

    this.deps.audioCapture.onChunk((chunk) => {
      if (this.state !== 'STREAMING')
        return
      void this.deps.asrClient.sendAudio(chunk.pcm16le).catch((error) => {
        void this.fail(error, 'send-audio-failed')
      })
    })

    this.deps.asrClient.onPartial((msg) => {
      if (!this.session || msg.sessionId !== this.session.sessionId)
        return
      this.session.partialText = msg.text
      if (!this.session.metrics.firstPartialAt) {
        this.session.metrics.firstPartialAt = Date.now()
      }
      this.log('partial received', {
        sessionId: msg.sessionId,
        textLength: msg.text.length,
        text: msg.text,
      })
      this.deps.onUiUpdate?.({
        sessionId: msg.sessionId,
        status: this.state === 'FINALIZING' ? 'finalizing' : 'recording',
        partialText: msg.text,
        elapsedMs: Date.now() - (this.session?.metrics.startedAt ?? Date.now()),
      })
    })

    this.deps.asrClient.onFinal((msg) => {
      this.handleFinal(msg)
    })

    this.deps.asrClient.onError((err) => {
      const isMetaTensorError
        = err.message.toLowerCase().includes('meta tensor')
          || err.message.toLowerCase().includes('cannot copy out of meta tensor')
      if (isMetaTensorError && (this.state === 'STREAMING' || this.state === 'FINALIZING')) {
        this.log('ignore recoverable ASR meta tensor error in active session', {
          state: this.state,
          code: err.code,
          message: err.message,
        })
        return
      }
      if (this.state === 'FINALIZING') {
        this.log('ignore ASR error during finalizing and wait for fallback path', {
          code: err.code,
          message: err.message,
        })
        return
      }
      void this.fail(err, 'asr-error', this.session?.sessionId)
    })
  }

  private handleFinal(msg: AsrFinalResponse): void {
    if (!this.session || msg.sessionId !== this.session.sessionId) {
      this.log('ignored final from stale session', { sessionId: msg.sessionId })
      return
    }

    if (msg.text.trim()) {
      // Keep latest finalized text for preempt-carry fallback.
      this.session.partialText = msg.text
      this.session.finalText = msg.text
    }

    this.log('final received', {
      sessionId: msg.sessionId,
      textLength: msg.text.length,
      text: msg.text,
    })
    if (this.waitFinalResolver) {
      this.waitFinalResolver(msg)
      this.waitFinalResolver = null
      if (this.waitFinalTimer) {
        clearTimeout(this.waitFinalTimer)
        this.waitFinalTimer = null
      }
    }
  }

  private isSessionCurrent(sessionId: string): boolean {
    return this.session?.sessionId === sessionId
  }

  private isSessionPreempted(sessionId: string): boolean {
    return this.preemptedSessionIds.has(sessionId)
  }

  private async preemptActiveSession(reason: string): Promise<void> {
    if (this.failing) {
      this.log('skip preempt while failing', { reason, state: this.state })
      return
    }
    const currentSessionId = this.session?.sessionId
    if (currentSessionId) {
      this.preemptedSessionIds.add(currentSessionId)

      let carry = this.session?.partialText?.trim() ?? ''
      if (!carry) {
        carry = await this.waitForPreemptCarry(currentSessionId, VOICE_TIMEOUT.PREEMPT_CARRY_WAIT_MS)
      }
      if (carry) {
        this.pendingCarryText = this.mergeCarryText(this.pendingCarryText, carry)
        this.pendingCarryAt = Date.now()
        this.log('cached partial from preempted session', {
          sessionId: currentSessionId,
          textLength: carry.length,
        })
      }
    }
    await this.cleanupSession(`preempt:${reason}`, currentSessionId)
    this.transition('IDLE', { reason })
    this.deps.onUiHide?.()
  }

  private async finalizeSession(sessionId: string): Promise<void> {
    if (!this.session || this.session.sessionId !== sessionId) {
      return
    }
    this.continueTimer = null
    this.continuingSessionId = null
    const session = this.session

    try {
      await this.deps.asrClient.end(session.sessionId)

      const final = await this.waitForFinal(VOICE_TIMEOUT.FINAL_MS)
      if (this.isSessionPreempted(sessionId) || !this.isSessionCurrent(sessionId)) {
        this.log('finalize canceled due to session preemption', { sessionId })
        return
      }
      let resolvedText = ''
      if (!final) {
        if (session.partialText.trim()) {
          resolvedText = session.partialText
          this.log('final timeout, fallback to latest partial', {
            sessionId: session.sessionId,
            textLength: resolvedText.length,
            text: resolvedText,
          })
        }
        else {
          throw this.makeError('E_ASR_TIMEOUT', `Final transcript timeout after ${VOICE_TIMEOUT.FINAL_MS}ms`)
        }
      }
      else if (!final.text.trim()) {
        if (session.partialText.trim()) {
          resolvedText = session.partialText
          this.log('empty final, fallback to latest partial', {
            sessionId: session.sessionId,
            textLength: resolvedText.length,
            text: resolvedText,
          })
        }
        else {
          throw this.makeError('E_EMPTY_RESULT', 'Empty final transcript')
        }
      }
      else {
        resolvedText = final.text
      }

      if (session.carryPrefix.trim()) {
        resolvedText = this.mergeCarryText(session.carryPrefix, resolvedText)
      }

      if (!resolvedText.trim()) {
        throw this.makeError('E_EMPTY_RESULT', 'Empty final transcript')
      }

      if (this.isSessionPreempted(sessionId) || !this.isSessionCurrent(sessionId)) {
        this.log('finalize stopped before inject due to session preemption', { sessionId })
        return
      }

      session.finalText = resolvedText
      session.metrics.finalAt = Date.now()

      this.transition('INJECTING', { sessionId: session.sessionId })
      const injectResult = await this.deps.textInjector.inject(resolvedText)
      session.metrics.injectedAt = Date.now()

      if (!injectResult.ok) {
        throw this.makeError('E_INJECT_FAILED', injectResult.reason ?? 'Injection failed')
      }
      this.transition('DONE', {
        sessionId: session.sessionId,
        mode: injectResult.mode,
        elapsedMs: session.metrics.injectedAt - session.metrics.startedAt,
      })
      this.deps.onUiFinal?.({
        sessionId: session.sessionId,
        finalText: resolvedText,
        mode: injectResult.mode === 'PASTE' ? 'pasted' : 'clipboard',
      })

      await this.cleanupSession('done', sessionId)
      this.transition('IDLE')
      this.deps.onUiHide?.()
    }
    catch (error) {
      if (!this.isSessionCurrent(sessionId)) {
        this.log('ignore finalize error from stale session', { sessionId })
        return
      }
      await this.fail(error, 'finalize-session', sessionId)
    }
  }

  private waitForFinal(timeoutMs: number): Promise<AsrFinalResponse | null> {
    return new Promise((resolve) => {
      this.waitFinalResolver = resolve
      this.waitFinalTimer = setTimeout(() => {
        this.waitFinalResolver = null
        this.waitFinalTimer = null
        resolve(null)
      }, timeoutMs)
    })
  }

  private async fail(error: unknown, phase: string, sessionId?: string): Promise<void> {
    if (sessionId && this.preemptedSessionIds.has(sessionId)) {
      this.log('ignore fail from preempted session', { phase, sessionId })
      return
    }
    if (this.failing) {
      this.log('skip duplicate fail', { phase })
      return
    }
    this.failing = true
    const err = this.normalizeError(error)
    this.transition('FAILED', {
      phase,
      code: err.code,
      message: err.message,
      recoverable: err.recoverable,
    })
    this.deps.onUiToast?.({ type: 'error', message: err.message })
    await this.cleanupSession(`failed:${phase}`, sessionId)
    this.transition('IDLE')
    this.deps.onUiHide?.()
    this.failing = false
  }

  private async cleanupSession(reason: string, expectedSessionId?: string): Promise<void> {
    if (expectedSessionId && this.session && this.session.sessionId !== expectedSessionId) {
      this.log('skip cleanup for stale session', {
        reason,
        expectedSessionId,
        currentSessionId: this.session.sessionId,
      })
      return
    }

    if (this.waitFinalTimer) {
      clearTimeout(this.waitFinalTimer)
      this.waitFinalTimer = null
    }
    if (this.continueTimer) {
      clearTimeout(this.continueTimer)
      this.continueTimer = null
    }
    this.continuingSessionId = null
    if (this.waitFinalResolver) {
      this.waitFinalResolver(null)
      this.waitFinalResolver = null
    }

    await this.deps.audioCapture.stop().catch(() => {})
    const preempting = reason.startsWith('preempt:')
    if (!preempting) {
      await this.deps.asrClient.close().catch(() => {})
    }

    if (this.session) {
      this.log('cleanup session', {
        reason,
        sessionId: this.session.sessionId,
        metrics: this.session.metrics,
      })
      this.preemptedSessionIds.delete(this.session.sessionId)
    }

    this.session = null
  }

  private transition(state: VoiceSessionState, extra: Record<string, unknown> = {}): void {
    this.state = state
    if (this.session) {
      this.session.state = state
    }
    this.log(`state -> ${state}`, extra)
  }

  private normalizeError(error: unknown): VoiceError {
    if (this.isVoiceError(error))
      return error

    return {
      code: 'E_ASR_CONNECT',
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    }
  }

  private isVoiceError(error: unknown): error is VoiceError {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && 'message' in error
      && 'recoverable' in error
  }

  private makeError(code: VoiceError['code'], message: string): VoiceError {
    return {
      code,
      message,
      recoverable: true,
    }
  }

  private mergeCarryText(prefix: string, current: string): string {
    const a = prefix.trim()
    const b = current.trim()
    if (!a)
      return b
    if (!b)
      return a
    const last = a[a.length - 1]
    const needsSpace = /[A-Za-z0-9]$/.test(last) && /^[A-Za-z0-9]/.test(b)
    return needsSpace ? `${a} ${b}` : `${a}${b}`
  }

  private shouldMergeCarryAt(nowMs: number): boolean {
    if (!this.pendingCarryText.trim())
      return false
    if (!this.pendingCarryAt)
      return false
    return nowMs - this.pendingCarryAt <= VOICE_TIMEOUT.CARRY_MERGE_WINDOW_MS
  }

  private clearPendingCarry(): void {
    this.pendingCarryText = ''
    this.pendingCarryAt = null
  }

  private async waitForPreemptCarry(sessionId: string, timeoutMs: number): Promise<string> {
    const startedAt = Date.now()
    while (Date.now() - startedAt <= timeoutMs) {
      if (!this.isSessionCurrent(sessionId))
        return ''
      const text = this.session?.partialText?.trim() ?? ''
      if (text)
        return text
      await this.sleep(40)
    }
    return this.session?.partialText?.trim() ?? ''
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
  }
}

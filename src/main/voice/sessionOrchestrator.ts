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
  private failing = false
  private hotkeyBound = false

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

  async handleHotkeyPress(): Promise<void> {
    if (this.state !== 'IDLE') {
      this.log('ignored hotkey press due to state guard', { state: this.state })
      return
    }

    const sessionId = createSessionId()
    this.session = {
      sessionId,
      state: 'ARMING',
      partialText: '',
      finalText: '',
      metrics: {
        sessionId,
        startedAt: Date.now(),
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
        language: 'Chinese',
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
      await this.fail(error, 'handleHotkeyPress')
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

    try {
      this.transition('FINALIZING', { sessionId: session.sessionId })
      this.deps.onUiUpdate?.({
        sessionId: session.sessionId,
        status: 'finalizing',
        partialText: session.partialText,
        elapsedMs: Date.now() - session.metrics.startedAt,
      })
      await this.deps.audioCapture.stop()
      await this.deps.asrClient.end(session.sessionId)

      const final = await this.waitForFinal(VOICE_TIMEOUT.FINAL_MS)
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

      await this.cleanupSession('done')
      this.transition('IDLE')
      this.deps.onUiHide?.()
    }
    catch (error) {
      await this.fail(error, 'handleHotkeyRelease')
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
      void this.fail(err, 'asr-error')
    })
  }

  private handleFinal(msg: AsrFinalResponse): void {
    if (!this.session || msg.sessionId !== this.session.sessionId) {
      this.log('ignored final from stale session', { sessionId: msg.sessionId })
      return
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

  private async fail(error: unknown, phase: string): Promise<void> {
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
    await this.cleanupSession(`failed:${phase}`)
    this.transition('IDLE')
    this.deps.onUiHide?.()
    this.failing = false
  }

  private async cleanupSession(reason: string): Promise<void> {
    if (this.waitFinalTimer) {
      clearTimeout(this.waitFinalTimer)
      this.waitFinalTimer = null
    }
    if (this.waitFinalResolver) {
      this.waitFinalResolver(null)
      this.waitFinalResolver = null
    }

    await this.deps.audioCapture.stop().catch(() => {})
    await this.deps.asrClient.close().catch(() => {})

    if (this.session) {
      this.log('cleanup session', {
        reason,
        sessionId: this.session.sessionId,
        metrics: this.session.metrics,
      })
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
}

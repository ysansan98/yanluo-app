import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setHotkeyDisabledGlobally } from '../../src/main/voice/hotkeyState'
import { DefaultSessionOrchestrator } from '../../src/main/voice/sessionOrchestrator'

const userDataDir = mkdtempSync(join(tmpdir(), 'yanluo-orchestrator-test-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataDir,
  },
}))

vi.mock('../../src/main/polish/polishEngine', () => ({
  polishEngine: {
    canPolish: () => ({ ok: false, reason: 'disabled' }),
    polish: vi.fn(),
  },
}))

interface FakeAsrMessage {
  sessionId: string
  text: string
  isFinal: boolean
}

class FakeAsrClient {
  connect = vi.fn(async () => {})
  start = vi.fn(async () => {})
  sendAudio = vi.fn(async () => {})
  end = vi.fn(async () => {})
  close = vi.fn(async () => {})

  private onPartialCb: ((msg: FakeAsrMessage) => void) | null = null
  private onFinalCb: ((msg: FakeAsrMessage) => void) | null = null
  private onErrorCb: ((err: { code: string, message: string, recoverable: boolean }) => void) | null = null

  onPartial(cb: (msg: FakeAsrMessage) => void): void {
    this.onPartialCb = cb
  }

  onFinal(cb: (msg: FakeAsrMessage) => void): void {
    this.onFinalCb = cb
  }

  onError(
    cb: (err: { code: string, message: string, recoverable: boolean }) => void,
  ): void {
    this.onErrorCb = cb
  }

  emitPartial(msg: FakeAsrMessage): void {
    this.onPartialCb?.(msg)
  }

  emitFinal(msg: FakeAsrMessage): void {
    this.onFinalCb?.(msg)
  }

  emitError(err: { code: string, message: string, recoverable: boolean }): void {
    this.onErrorCb?.(err)
  }
}

class FakeAudioCapture {
  start = vi.fn(async () => {})
  stop = vi.fn(async () => {})

  onChunk(
    _cb: (chunk: {
      pcm16le: Uint8Array
      sampleRate: 16000
      channels: 1
      timestampMs: number
    }) => void,
  ): void {}

  onSilentCancel(_cb: () => void): void {}
}

class FakeHotkeyManager {
  start = vi.fn(async () => {})
  stop = vi.fn(async () => {})
  reset = vi.fn()
  onPress = vi.fn()
  onRelease = vi.fn()
  onError = vi.fn()
  updateShortcut = vi.fn()
}

class FakeTextInjector {
  inject = vi.fn(async () => ({ ok: true, mode: 'CLIPBOARD_ONLY' as const }))
}

function createOrchestrator(overrides?: {
  ensureOrPrompt?: (kind: string) => Promise<'GRANTED' | 'DENIED' | 'NOT_DETERMINED' | 'RESTRICTED'>
  onUiHide?: () => void
  onUiToast?: (payload: { type: 'info' | 'success' | 'warning' | 'error', message: string }) => void
  onUiFinal?: (payload: { sessionId: string, finalText: string, mode: 'pasted' | 'clipboard', audioPath: string | null }) => void
  onUiShow?: (payload: { sessionId: string, status: 'arming' | 'recording' | 'finalizing' }) => void
}) {
  const hotkeyManager = new FakeHotkeyManager()
  const audioCapture = new FakeAudioCapture()
  const asrClient = new FakeAsrClient()
  const textInjector = new FakeTextInjector()

  const orchestrator = new DefaultSessionOrchestrator({
    hotkeyManager: hotkeyManager as never,
    audioCapture: audioCapture as never,
    asrClient: asrClient as never,
    textInjector: textInjector as never,
    permissionChecker: {
      check: async () => 'GRANTED',
      ensureOrPrompt: overrides?.ensureOrPrompt ?? (async () => 'GRANTED'),
    } as never,
    settingsStore: {
      get: () => ({
        shortcuts: { pushToTalk: 'Ctrl + Z' },
        polish: { selectedCommandId: null },
      }),
    } as never,
    getMainWindow: () => null,
    onUiHide: overrides?.onUiHide,
    onUiToast: overrides?.onUiToast,
    onUiFinal: overrides?.onUiFinal,
    onUiShow: overrides?.onUiShow,
    log: () => {},
  })

  return { orchestrator, asrClient }
}

describe('defaultSessionOrchestrator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setHotkeyDisabledGlobally(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows error toast and hides when microphone permission denied', async () => {
    const onUiToast = vi.fn()
    const onUiHide = vi.fn()
    const { orchestrator } = createOrchestrator({
      ensureOrPrompt: async () => 'DENIED',
      onUiToast,
      onUiHide,
    })
    await orchestrator.init({ delayHotkey: true })

    await orchestrator.handleHotkeyPress({ skipPrerequisiteChecks: true })

    expect(onUiToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    )
    expect(onUiHide).toHaveBeenCalled()
  })

  it('silently hides session when final times out with empty partial', async () => {
    const onUiHide = vi.fn()
    const onUiFinal = vi.fn()
    const { orchestrator } = createOrchestrator({ onUiHide, onUiFinal })
    await orchestrator.init({ delayHotkey: true })

    await orchestrator.handleHotkeyPress({ skipPrerequisiteChecks: true })
    await orchestrator.handleHotkeyRelease()

    await vi.advanceTimersByTimeAsync(14_100)

    expect(onUiHide).toHaveBeenCalled()
    expect(onUiFinal).not.toHaveBeenCalled()
  })

  it('does not connect ASR when testUiOnly is enabled', async () => {
    const onUiShow = vi.fn()
    const { orchestrator, asrClient } = createOrchestrator({
      onUiShow,
    })
    await orchestrator.init({ delayHotkey: true })

    await orchestrator.handleHotkeyPress({
      skipPrerequisiteChecks: true,
      testUiOnly: true,
    })

    expect(onUiShow).toHaveBeenCalled()
    expect(asrClient.connect).not.toHaveBeenCalled()
    expect(asrClient.start).not.toHaveBeenCalled()
  })

  it('shows error and hides when ASR connect fails', async () => {
    const onUiToast = vi.fn()
    const onUiHide = vi.fn()
    const { orchestrator, asrClient } = createOrchestrator({
      onUiToast,
      onUiHide,
    })
    asrClient.connect.mockRejectedValueOnce(new Error('asr unavailable'))
    await orchestrator.init({ delayHotkey: true })

    await orchestrator.handleHotkeyPress({ skipPrerequisiteChecks: true })

    expect(onUiToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'asr unavailable' }),
    )
    expect(onUiHide).toHaveBeenCalled()
  })
})

afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

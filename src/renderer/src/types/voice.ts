export interface VoiceUiShowPayload {
  sessionId: string
  status: 'arming' | 'recording' | 'finalizing'
}

export interface VoiceUiUpdatePayload {
  sessionId: string
  status: 'recording' | 'finalizing'
  partialText: string
  elapsedMs: number
}

export interface VoiceUiFinalPayload {
  sessionId: string
  finalText: string
  mode: 'pasted' | 'clipboard'
  audioPath: string | null
}

export interface VoiceUiToastPayload {
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export interface VoiceApi {
  onShow: (cb: (payload: VoiceUiShowPayload) => void) => () => void
  onUpdate: (cb: (payload: VoiceUiUpdatePayload) => void) => () => void
  onFinal: (cb: (payload: VoiceUiFinalPayload) => void) => () => void
  onHide: (cb: () => void) => () => void
  onToast: (cb: (payload: VoiceUiToastPayload) => void) => () => void
  onAudioStart: (cb: () => void) => () => void
  onAudioStop: (cb: () => void) => () => void
  sendAudioChunk: (payload: {
    pcm16leBase64: string
    sampleRate: number
    channels: number
    timestampMs: number
  }) => void
  sendAudioState: (payload: {
    state: 'started' | 'stopped' | 'running'
    timestampMs: number
    phase?: string
    rms?: number
    maxAbs?: number
    nonZeroRatio?: number
    audioContextState?: string
    inputDeviceLabel?: string
  }) => void
  sendAudioError: (payload: { message: string }) => void
  startRecording: () => Promise<{ ok: true }>
  stopRecording: () => Promise<{ ok: true }>
  getConfig: () => Promise<{ continueWindowMs: number }>
  setConfig: (payload: { continueWindowMs?: number }) => Promise<{ ok: true, continueWindowMs: number }>
}

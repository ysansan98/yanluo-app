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
}

// Import shared voice types from ~shared
import type {
  VoiceUiFinalPayload as SharedVoiceUiFinalPayload,
  VoiceUiShowPayload as SharedVoiceUiShowPayload,
  VoiceUiToastPayload as SharedVoiceUiToastPayload,
  VoiceUiUpdatePayload as SharedVoiceUiUpdatePayload,
} from '~shared/voice'

// Re-export for backward compatibility
export type VoiceUiFinalPayload = SharedVoiceUiFinalPayload
export type VoiceUiShowPayload = SharedVoiceUiShowPayload
export type VoiceUiToastPayload = SharedVoiceUiToastPayload
export type VoiceUiUpdatePayload = SharedVoiceUiUpdatePayload

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
  setConfig: (payload: {
    continueWindowMs?: number
  }) => Promise<{ ok: true, continueWindowMs: number }>
}

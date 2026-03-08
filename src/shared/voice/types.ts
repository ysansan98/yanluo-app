/**
 * Voice-related shared types used by both main and renderer processes
 */

// UI Payload types for voice session communication
export interface VoiceUiShowPayload {
  // Created once when a new voice session enters visible states.
  sessionId: string
  status: 'arming' | 'recording' | 'finalizing'
}

export interface VoiceUiUpdatePayload {
  // Incremental updates while streaming or waiting final result.
  sessionId: string
  status: 'recording' | 'finalizing'
  partialText: string
  elapsedMs: number
}

export interface VoiceUiFinalPayload {
  // Final transcript and final delivery path.
  sessionId: string
  finalText: string
  mode: 'pasted' | 'clipboard'
  audioPath: string | null
}

export interface VoiceUiToastPayload {
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
}

/** IPC Channels for voice-related communication */
export const VOICE_IPC = {
  UI_SHOW: 'voice:ui:show',
  UI_UPDATE: 'voice:ui:update',
  UI_FINAL: 'voice:ui:final',
  UI_HIDE: 'voice:ui:hide',
  UI_TOAST: 'voice:ui:toast',
  COMMAND_TOGGLE: 'voice:command:toggle',
} as const

export const AUDIO_IPC = {
  START: 'voice:audio:start',
  STOP: 'voice:audio:stop',
  CHUNK: 'voice:audio:chunk',
  ERROR: 'voice:audio:error',
  STATE: 'voice:audio:state',
} as const

export type VoiceIpcChannel = (typeof VOICE_IPC)[keyof typeof VOICE_IPC]
export type AudioIpcChannel = (typeof AUDIO_IPC)[keyof typeof AUDIO_IPC]

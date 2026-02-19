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

// VAD Configuration
export interface VadConfig {
  /** Whether VAD is enabled */
  enabled: boolean
  /** Energy threshold for speech detection (0-1) */
  threshold: number
  /** Minimum speech duration to consider valid (ms) */
  minSpeechMs: number
  /** Grace period after speech stops (ms) */
  redemptionMs: number
  /** Minimum total audio duration to process (ms) */
  minDurationMs: number
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  enabled: true,
  threshold: 0.5,
  minSpeechMs: 150,
  redemptionMs: 150,
  minDurationMs: 300,
} as const

/** Energy detection thresholds for real-time VAD */
export const VAD_ENERGY_THRESHOLDS = {
  /** Minimum RMS value to consider as potential speech */
  MIN_RMS: 0.008,
  /** Minimum absolute amplitude to consider as active */
  ACTIVE_ABS_THRESHOLD: 0.02,
  /** Activity window size (~200ms at 48kHz with 4096 buffer) */
  ACTIVITY_WINDOW_SIZE: 10,
  /** Minimum active frames in window to mark as valid speech */
  MIN_ACTIVE_FRAMES: 3,
} as const

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
  VAD_SILENT_CANCEL: 'voice:audio:vad-silent-cancel',
} as const

export const VAD_CONFIG_IPC = {
  GET: 'voice:vad:getConfig',
  SET: 'voice:vad:setConfig',
  UPDATED: 'voice:vad:config-updated',
} as const

export type VoiceIpcChannel = (typeof VOICE_IPC)[keyof typeof VOICE_IPC]
export type AudioIpcChannel = (typeof AUDIO_IPC)[keyof typeof AUDIO_IPC]
export type VadConfigIpcChannel
  = (typeof VAD_CONFIG_IPC)[keyof typeof VAD_CONFIG_IPC]

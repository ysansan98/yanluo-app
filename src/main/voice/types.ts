import type { Buffer } from 'node:buffer'

export type VoiceSessionState
  = | 'IDLE'
    | 'ARMING'
    | 'STREAMING'
    | 'FINALIZING'
    | 'INJECTING'
    | 'DONE'
    | 'FAILED'

export type VoiceOverlayStatus
  = | 'arming'
    | 'recording'
    | 'finalizing'
    | 'success'
    | 'error'
export type InjectMode = 'PASTE' | 'CLIPBOARD_ONLY'
export type PermissionKind
  = | 'MICROPHONE'
    | 'ACCESSIBILITY'
    | 'INPUT_MONITORING'
export type PermissionStatus
  = | 'GRANTED'
    | 'DENIED'
    | 'NOT_DETERMINED'
    | 'RESTRICTED'

export type VoiceErrorCode
  = | 'E_MIC_PERMISSION'
    | 'E_ACCESSIBILITY_PERMISSION'
    | 'E_HOTKEY_UNAVAILABLE'
    | 'E_ASR_CONNECT'
    | 'E_ASR_TIMEOUT'
    | 'E_INJECT_FAILED'
    | 'E_EMPTY_RESULT'

export interface VoiceError {
  code: VoiceErrorCode
  message: string
  recoverable: boolean
}

export interface VoiceSessionMetrics {
  sessionId: string
  startedAt: number
  firstPartialAt?: number
  finalAt?: number
  injectedAt?: number
}

export interface VoiceSessionContext {
  sessionId: string
  state: VoiceSessionState
  partialText: string
  finalText: string
  injectMode?: InjectMode
  metrics: VoiceSessionMetrics
}

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

export interface AudioChunk {
  // Raw PCM chunk sent to streaming ASR.
  pcm16le: Buffer
  sampleRate: 16000
  channels: 1
  timestampMs: number
}

export interface AsrStartRequest {
  sessionId: string
  sampleRate: number
  language: string
}

export interface AsrPartialResponse {
  sessionId: string
  text: string
  isFinal: false
}

export interface AsrFinalResponse {
  sessionId: string
  text: string
  isFinal: true
  confidence?: number
}

export interface InjectResult {
  ok: boolean
  mode: InjectMode
  reason?: string
}

export interface HotkeyManager {
  // Register system-level hotkey listeners.
  start: () => Promise<void>
  stop: () => Promise<void>
  reset: (reason?: string) => void
  onPress: (cb: () => void) => void
  onRelease: (cb: () => void) => void
  onError: (cb: (err: VoiceError) => void) => void
}

// Re-export shared VAD types from ~shared
export type { VadConfig } from '~shared/voice'
export { DEFAULT_VAD_CONFIG } from '~shared/voice'

export interface AudioCapture {
  // Start/stop microphone and emit PCM chunks.
  start: () => Promise<void>
  stop: () => Promise<void>
  onChunk: (cb: (chunk: AudioChunk) => void) => void
  onSilentCancel: (cb: () => void) => void
}

export interface StreamingAsrClient {
  // Manage the streaming ASR session lifecycle.
  connect: () => Promise<void>
  start: (req: AsrStartRequest) => Promise<void>
  sendAudio: (chunk: Buffer) => Promise<void>
  end: (sessionId: string) => Promise<void>
  close: () => Promise<void>
  onPartial: (cb: (msg: AsrPartialResponse) => void) => void
  onFinal: (cb: (msg: AsrFinalResponse) => void) => void
  onError: (cb: (err: VoiceError) => void) => void
}

export interface TextInjector {
  // Inject transcript into focused app or fallback to clipboard.
  inject: (text: string) => Promise<InjectResult>
}

export interface PermissionChecker {
  // Inspect and guide required system permissions.
  check: (kind: PermissionKind) => Promise<PermissionStatus>
  ensureOrPrompt: (kind: PermissionKind) => Promise<PermissionStatus>
}

export interface SessionOrchestrator {
  // Coordinates hotkey, audio, ASR and injection modules.
  init: () => Promise<void>
  dispose: () => Promise<void>
  handleHotkeyPress: () => Promise<void>
  handleHotkeyRelease: () => Promise<void>
  getContinueWindowMs?: () => number
  setContinueWindowMs?: (ms: number) => void
}

export const VOICE_TIMEOUT = {
  ARMING_MS: 1500,
  FINAL_MS: 12000,
  ASR_IDLE_MS: 3000,
  UI_AUTO_HIDE_MS: 1000,
  CONTINUE_WINDOW_MS: 2000,
  CARRY_MERGE_WINDOW_MS: 2000,
  PREEMPT_CARRY_WAIT_MS: 700,
} as const

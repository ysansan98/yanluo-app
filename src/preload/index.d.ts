import type { ElectronAPI } from '@electron-toolkit/preload'
import type { VoiceBridgeApi } from './voiceBridge'

export interface DownloadProgress {
  type: 'start' | 'progress' | 'file_complete' | 'complete' | 'error'
  filename?: string
  downloaded?: number
  total?: number
  percent?: number
  message?: string
  model_id?: string
  local_dir?: string
}

type PermissionKind = 'MICROPHONE' | 'ACCESSIBILITY'
type PermissionStatus = 'GRANTED' | 'DENIED' | 'NOT_DETERMINED' | 'RESTRICTED'

interface AsrApi {
  health: () => Promise<{
    status: string
    model_loaded: boolean
    model_error?: string | null
  }>
  modelInfo: () => Promise<{
    modelId: string
    modelDir: string
    exists: boolean
  }>
  downloadModel: () => Promise<{ status: 'ok' | 'exists' | 'running' }>
  onDownloadLog: (
    handler: (payload: { type: string, message: string }) => void,
  ) => () => void
  onDownloadProgress: (
    handler: (progress: DownloadProgress) => void,
  ) => () => void
  transcribeFile: (
    path: string,
    language?: string,
  ) => Promise<{ text: string, language: string, elapsed_ms?: number }>
  pickAudioFile: () => Promise<string | null>
}

interface HistoryApi {
  create: (payload: {
    source: 'file' | 'live'
    entryType: 'asr_only' | 'polish'
    commandName?: string | null
    text: string
    language?: string
    elapsedMs?: number
    audioPath?: string | null
    triggeredAt?: number
  }) => Promise<{
    id: string
    source: 'file' | 'live'
    entryType: 'asr_only' | 'polish'
    commandName: string | null
    text: string
    textLength: number
    language: string
    elapsedMs: number
    audioPath: string | null
    triggeredAt: number
    createdAt: number
  }>
  list: (payload?: { limit?: number }) => Promise<
    Array<{
      id: string
      source: 'file' | 'live'
      entryType: 'asr_only' | 'polish'
      commandName: string | null
      text: string
      textLength: number
      language: string
      elapsedMs: number
      audioPath: string | null
      triggeredAt: number
      createdAt: number
    }>
  >
  clear: () => Promise<{ ok: true }>
  readAudio: (payload: {
    path: string
  }) => Promise<
    { ok: true, mime: string, base64: string } | { ok: false, message: string }
  >
}

interface OnboardingApi {
  getStatus: () => Promise<{ completed: boolean, skippedSteps: string[] }>
  complete: () => Promise<{ ok: boolean }>
  skipStep: (stepId: string) => Promise<{ ok: boolean }>
  reset: () => Promise<{ ok: boolean }>
}

interface PermissionApi {
  check: (kind: PermissionKind) => Promise<PermissionStatus>
  request: (kind: PermissionKind) => Promise<PermissionStatus>
}

interface ShortcutApi {
  get: () => Promise<string | null>
  set: (shortcut: string | null) => Promise<{ ok: boolean }>
  disableGlobal: () => Promise<{ ok: boolean }>
  enableGlobal: () => Promise<{ ok: boolean }>
}

interface AppEventApi {
  onShowOnboarding: (handler: () => void) => () => void
  onModelRequired: (handler: () => void) => () => void
  onShortcutRequired: (handler: () => void) => () => void
}

interface AppApi {
  asr: AsrApi
  history: HistoryApi
  voice: VoiceBridgeApi
  onboarding: OnboardingApi
  permission: PermissionApi
  shortcut: ShortcutApi
  app: AppEventApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}

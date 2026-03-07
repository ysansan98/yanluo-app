import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AiCheckConfiguredResponse,
  AiGetConfigResponse,
  AiRegistryResponse,
  AiSetProviderConfigRequest,
  AiValidateProviderResponse,
  AsrDownloadLogEvent,
  AsrDownloadModelResponse,
  AsrDownloadProgress,
  AsrHealthResponse,
  AsrModelInfoResponse,
  HistoryCreateRequest,
  HistoryEntry,
  HistoryListRequest,
  HistoryListResponse,
  HistoryReadAudioRequest,
  HistoryReadAudioResponse,
  LogsExportResponse,
  PolishAddCommandRequest,
  PolishCommandsResponse,
  PolishConfigResponse,
  PolishUpdateSettingsRequest,
  ShortcutGetResponse,
} from '~shared/ipc'
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
  health: () => Promise<AsrHealthResponse>
  modelInfo: () => Promise<AsrModelInfoResponse>
  downloadModel: () => Promise<AsrDownloadModelResponse>
  onDownloadLog: (
    handler: (payload: AsrDownloadLogEvent) => void,
  ) => () => void
  onDownloadProgress: (
    handler: (progress: AsrDownloadProgress) => void,
  ) => () => void
}

interface HistoryApi {
  create: (payload: HistoryCreateRequest) => Promise<HistoryEntry>
  list: (payload?: HistoryListRequest) => Promise<HistoryListResponse>
  clear: () => Promise<{ ok: true }>
  readAudio: (payload: HistoryReadAudioRequest) => Promise<HistoryReadAudioResponse>
  onCreated: (listener: (entry: HistoryEntry) => void) => () => void
}

interface OnboardingApi {
  getStatus: () => Promise<{ completed: boolean, skippedSteps: string[] }>
  complete: () => Promise<{ ok: true }>
  skipStep: (stepId: string) => Promise<{ ok: true }>
  reset: () => Promise<{ ok: true }>
}

interface PermissionApi {
  check: (kind: PermissionKind) => Promise<PermissionStatus>
  request: (kind: PermissionKind) => Promise<PermissionStatus>
}

interface ShortcutApi {
  get: () => Promise<ShortcutGetResponse>
  set: (shortcut: string | null) => Promise<{ ok: true }>
  disableGlobal: () => Promise<{ ok: true }>
  enableGlobal: () => Promise<{ ok: true }>
  initHotkey: () => Promise<{ ok: true }>
}

interface AppEventApi {
  onShowOnboarding: (handler: () => void) => () => void
  onModelRequired: (handler: () => void) => () => void
  onShortcutRequired: (handler: () => void) => () => void
}

interface ClipboardApi {
  writeText: (text: string) => Promise<{ ok: true } | { ok: false, error: string }>
}

interface LogApi {
  debug: (scope: string, message: string, extra?: unknown) => Promise<void>
  info: (scope: string, message: string, extra?: unknown) => Promise<void>
  warn: (scope: string, message: string, extra?: unknown) => Promise<void>
  error: (scope: string, message: string, extra?: unknown) => Promise<void>
}

interface DiagnosticsApi {
  exportRecentLogs: (minutes?: number) => Promise<LogsExportResponse>
}

// AI Provider Types
interface AiProviderInfo {
  id: string
  name: string
  npm: string
  api: string | null
  env: string[]
  doc: string
  models: Record<string, {
    id: string
    name: string
    limit: { context?: number, output?: number, input?: number }
  }>
}

interface AiProviderUserConfig {
  enabled: boolean
  apiKey: string // masked as '********' in renderer
  customApiEndpoint?: string
  selectedModelId?: string
}

interface AiRegistry {
  providers: Record<string, AiProviderInfo>
}

interface AiApi {
  getRegistry: () => Promise<AiRegistryResponse>
  getConfig: () => Promise<AiGetConfigResponse>
  setProviderConfig: (providerId: string, config: AiSetProviderConfigRequest) => Promise<{ ok: true }>
  removeProviderConfig: (providerId: string) => Promise<{ ok: true }>
  setActiveProvider: (providerId: string | null, modelId: string | null) => Promise<{ ok: true }>
  checkConfigured: () => Promise<AiCheckConfiguredResponse>
  validateProvider: (providerId: string, modelId: string) => Promise<AiValidateProviderResponse>
}

// Polish Types
interface PolishCommand {
  id: string
  name: string
  icon?: string
  promptTemplate: string
  isBuiltIn: boolean
  order: number
}

interface PolishApi {
  getConfig: () => Promise<PolishConfigResponse>
  setEnabled: (enabled: boolean) => Promise<{ ok: true }>
  setCommand: (commandId: string | null) => Promise<{ ok: true }>
  getCommands: () => Promise<PolishCommandsResponse>
  updateSettings: (payload: PolishUpdateSettingsRequest) => Promise<{ ok: true }>
  addCommand?: (command: PolishAddCommandRequest) => Promise<{ ok: true }>
  removeCommand?: (commandId: string) => Promise<{ ok: true }>
}

interface AppApi {
  asr: AsrApi
  history: HistoryApi
  voice: VoiceBridgeApi
  ai: AiApi
  polish: PolishApi
  onboarding: OnboardingApi
  permission: PermissionApi
  shortcut: ShortcutApi
  clipboard: ClipboardApi
  diagnostics: DiagnosticsApi
  log: LogApi
  app: AppEventApi
  test?: {
    triggerShortcutHub: () => Promise<{ ok: true }>
    pushHistoryEntry: (text: string) => Promise<HistoryEntry>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}

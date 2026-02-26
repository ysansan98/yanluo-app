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
}

interface HistoryApi {
  create: (payload: {
    source: 'live'
    entryType: 'asr_only' | 'polish'
    commandName?: string | null
    text: string
    language?: string
    elapsedMs?: number
    audioPath?: string | null
    triggeredAt?: number
  }) => Promise<{
    id: string
    source: 'live'
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
      source: 'live'
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
  initHotkey: () => Promise<{ ok: boolean }>
}

interface AppEventApi {
  onShowOnboarding: (handler: () => void) => () => void
  onModelRequired: (handler: () => void) => () => void
  onShortcutRequired: (handler: () => void) => () => void
}

interface ClipboardApi {
  writeText: (text: string) => Promise<{ ok: boolean, error?: string }>
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
  getRegistry: () => Promise<AiRegistry>
  getConfig: () => Promise<{
    providers: Record<string, AiProviderUserConfig>
    activeProviderId: string | null
    activeModelId: string | null
  }>
  setProviderConfig: (providerId: string, config: {
    apiKey?: string
    customApiEndpoint?: string
    selectedModelId?: string
  }) => Promise<{ ok: boolean }>
  removeProviderConfig: (providerId: string) => Promise<{ ok: boolean }>
  setActiveProvider: (providerId: string | null, modelId: string | null) => Promise<{ ok: boolean }>
  checkConfigured: () => Promise<{
    hasEnabledProvider: boolean
    isActiveProviderValid: boolean
  }>
  validateProvider: (providerId: string, modelId: string) => Promise<{
    ok: boolean
    message?: string
    error?: string
  }>
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
  getConfig: () => Promise<{
    enabled: boolean
    selectedCommandId: string | null
    temperature: number
    maxTokens: number
  }>
  setEnabled: (enabled: boolean) => Promise<{ ok: boolean }>
  setCommand: (commandId: string | null) => Promise<{ ok: boolean }>
  getCommands: () => Promise<PolishCommand[]>
  updateSettings: (payload: { temperature?: number, maxTokens?: number }) => Promise<{ ok: boolean }>
  addCommand?: (command: {
    id: string
    name: string
    promptTemplate: string
    icon?: string
  }) => Promise<{ ok: boolean }>
  removeCommand?: (commandId: string) => Promise<{ ok: boolean }>
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
  app: AppEventApi
  test?: {
    triggerShortcutHub: () => Promise<{ ok: true }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}

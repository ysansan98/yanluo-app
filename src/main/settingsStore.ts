import type { AiProviderUserConfig, ProviderKey } from '~shared/ai'
import type { VadConfig } from '~shared/voice'
import Store from 'electron-store'
import { DEFAULT_VAD_CONFIG } from '~shared/voice'

// Alias for backward compatibility - VadSettings is the same as VadConfig
export type VadSettings = VadConfig

const DEFAULT_VAD: VadSettings = { ...DEFAULT_VAD_CONFIG }

// Re-export for convenience
export type { AiProviderUserConfig, ProviderKey } from '~shared/ai'

export interface AiSettings {
  providers: Partial<Record<ProviderKey, AiProviderUserConfig>>
  activeProviderId: ProviderKey | null
  activeModelId: string | null
}

export interface PolishCommand {
  id: string
  name: string
  icon?: string
  promptTemplate: string
  isBuiltIn: boolean
  order: number
}

export interface PolishSettings {
  enabled: boolean
  selectedCommandId: string | null
  temperature: number
  maxTokens: number
  // 内置指令只读，不存储在 settings 中
  customCommands: PolishCommand[]
}

// ===== Settings Interface =====

export interface OnboardingConfig {
  completed: boolean
  skippedSteps: string[]
}

export interface AppSettingsV2 {
  version: 2
  onboarding: OnboardingConfig
  voice: {
    continueWindowMs: number
    vad: VadSettings
  }
  ai: AiSettings
  polish: PolishSettings
  shortcuts: {
    pushToTalk: string | null
  }
}

type AppSettings = AppSettingsV2

// ===== Default Built-in Polish Commands =====

export const BUILT_IN_POLISH_COMMANDS: PolishCommand[] = [
  {
    id: 'polish-none',
    name: '不润色',
    promptTemplate: '{{text}}',
    isBuiltIn: true,
    order: 0,
  },
  {
    id: 'polish-oral',
    name: '去口语化',
    promptTemplate:
      '请将以下口语化内容转为正式书面语，去除冗余词、口头禅和重复内容，保持原意：\n\n{{text}}',
    isBuiltIn: true,
    order: 1,
  },
  {
    id: 'polish-concise',
    name: '精简表达',
    promptTemplate: '请将以下内容精简表达，去除冗余信息，保留核心要点：\n\n{{text}}',
    isBuiltIn: true,
    order: 2,
  },
  {
    id: 'translate-en',
    name: '翻译为英文',
    promptTemplate: '请将以下内容翻译为地道、专业的英文：\n\n{{text}}',
    isBuiltIn: true,
    order: 3,
  },
  {
    id: 'work-report',
    name: '工作汇报格式',
    promptTemplate:
      '请将以下内容整理为工作汇报格式，包含背景、行动、结果三个部分：\n\n{{text}}',
    isBuiltIn: true,
    order: 4,
  },
  {
    id: 'meeting-minutes',
    name: '会议纪要格式',
    promptTemplate:
      '请将以下内容提炼为会议纪要格式，包含议题、决议、待办事项：\n\n{{text}}',
    isBuiltIn: true,
    order: 5,
  },
]

// ===== Default Settings =====

const DEFAULT_SETTINGS: AppSettings = {
  version: 2,
  onboarding: {
    completed: false,
    skippedSteps: [],
  },
  voice: {
    continueWindowMs: 2000,
    vad: { ...DEFAULT_VAD },
  },
  ai: {
    providers: {},
    activeProviderId: null,
    activeModelId: null,
  },
  polish: {
    enabled: false,
    selectedCommandId: null,
    temperature: 0.3,
    maxTokens: 2000,
    customCommands: [],
  },
  shortcuts: {
    pushToTalk: null,
  },
}

// ===== Value Clamping Functions =====

function clampContinueWindow(value: number): number {
  const next = Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_SETTINGS.voice.continueWindowMs
  return Math.min(8000, Math.max(200, next))
}

function clampVadThreshold(value: number): number {
  const next = Number.isFinite(value) ? value : DEFAULT_VAD.threshold
  return Math.min(1, Math.max(0, next))
}

function clampVadMinSpeechMs(value: number): number {
  const next = Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_VAD.minSpeechMs
  return Math.min(2000, Math.max(50, next))
}

function clampVadRedemptionMs(value: number): number {
  const next = Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_VAD.redemptionMs
  return Math.min(2000, Math.max(50, next))
}

function clampVadMinDurationMs(value: number): number {
  const next = Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_VAD.minDurationMs
  return Math.min(5000, Math.max(100, next))
}

function clampPolishTemperature(value: number): number {
  const next = Number.isFinite(value) ? value : DEFAULT_SETTINGS.polish.temperature
  return Math.min(2, Math.max(0, next))
}

function clampPolishMaxTokens(value: number): number {
  const next = Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_SETTINGS.polish.maxTokens
  return Math.min(16000, Math.max(100, next))
}

// ===== Settings Store Class =====

export class SettingsStore {
  private store: Store<AppSettings> | null = null

  private getStore(): Store<AppSettings> {
    if (this.store)
      return this.store
    const StoreCtor
      = (Store as unknown as { default?: typeof Store }).default ?? Store
    this.store = new StoreCtor<AppSettings>({
      name: 'settings',
      defaults: DEFAULT_SETTINGS,
      clearInvalidConfig: true,
    })
    return this.store
  }

  get(): AppSettings {
    const store = this.getStore()
    const current = store.store
    const merged = this.mergeDefaults(current)
    if (merged !== current) {
      store.set(merged)
    }
    return merged
  }

  // ===== Onboarding Methods =====

  completeOnboarding(): void {
    const store = this.getStore()
    const current = store.get('onboarding')
    store.set('onboarding', {
      ...current,
      completed: true,
    })
  }

  skipOnboardingStep(stepId: string): void {
    const store = this.getStore()
    const current = store.get('onboarding')
    if (!current.skippedSteps.includes(stepId)) {
      store.set('onboarding', {
        ...current,
        skippedSteps: [...current.skippedSteps, stepId],
      })
    }
  }

  resetOnboarding(): void {
    const store = this.getStore()
    store.set('onboarding', DEFAULT_SETTINGS.onboarding)
  }

  // ===== Shortcut Methods =====

  getShortcut(): string | null {
    return this.get().shortcuts.pushToTalk
  }

  setShortcut(shortcut: string | null): void {
    const store = this.getStore()
    store.set('shortcuts.pushToTalk', shortcut)
  }

  // ===== Voice Settings Methods =====

  updateVoiceSettings(payload: { continueWindowMs?: number }): AppSettings {
    const current = this.get()
    const nextVoice = {
      ...current.voice,
      ...(typeof payload.continueWindowMs === 'number'
        ? { continueWindowMs: clampContinueWindow(payload.continueWindowMs) }
        : {}),
    }
    const nextSettings: AppSettings = {
      ...current,
      voice: nextVoice,
    }
    this.getStore().set(nextSettings)
    return nextSettings
  }

  updateVadSettings(payload: Partial<VadSettings>): AppSettings {
    const current = this.get()
    const nextVad = {
      ...current.voice.vad,
      ...(typeof payload.enabled === 'boolean'
        ? { enabled: payload.enabled }
        : {}),
      ...(typeof payload.threshold === 'number'
        ? { threshold: clampVadThreshold(payload.threshold) }
        : {}),
      ...(typeof payload.minSpeechMs === 'number'
        ? { minSpeechMs: clampVadMinSpeechMs(payload.minSpeechMs) }
        : {}),
      ...(typeof payload.redemptionMs === 'number'
        ? { redemptionMs: clampVadRedemptionMs(payload.redemptionMs) }
        : {}),
      ...(typeof payload.minDurationMs === 'number'
        ? { minDurationMs: clampVadMinDurationMs(payload.minDurationMs) }
        : {}),
    }
    const nextSettings: AppSettings = {
      ...current,
      voice: {
        ...current.voice,
        vad: nextVad,
      },
    }
    this.getStore().set(nextSettings)
    return nextSettings
  }

  // ===== AI Provider Methods =====

  getAiProviderConfig(providerId: ProviderKey): AiProviderUserConfig | undefined {
    return this.get().ai.providers[providerId]
  }

  setAiProviderConfig(
    providerId: ProviderKey,
    config: Partial<AiProviderUserConfig>,
  ): AppSettings {
    const current = this.get()
    const existing = current.ai.providers[providerId] || {
      enabled: false,
      apiKey: '',
    }

    const nextProvider: AiProviderUserConfig = {
      ...existing,
      ...config,
      // Ensure apiKey is never undefined
      apiKey: config.apiKey ?? existing.apiKey,
      enabled: config.enabled ?? existing.enabled,
    }

    const nextSettings: AppSettings = {
      ...current,
      ai: {
        ...current.ai,
        providers: {
          ...current.ai.providers,
          [providerId]: nextProvider,
        },
      },
    }

    this.getStore().set(nextSettings)
    return nextSettings
  }

  removeAiProviderConfig(providerId: ProviderKey): AppSettings {
    const current = this.get()
    const { [providerId]: _, ...remainingProviders } = current.ai.providers

    const nextSettings: AppSettings = {
      ...current,
      ai: {
        ...current.ai,
        providers: remainingProviders,
        // Clear active if removed provider was active
        activeProviderId:
          current.ai.activeProviderId === providerId
            ? null
            : current.ai.activeProviderId,
        activeModelId:
          current.ai.activeProviderId === providerId
            ? null
            : current.ai.activeModelId,
      },
    }

    this.getStore().set(nextSettings)
    return nextSettings
  }

  setActiveProvider(providerId: ProviderKey | null, modelId: string | null): AppSettings {
    const current = this.get()
    const nextSettings: AppSettings = {
      ...current,
      ai: {
        ...current.ai,
        activeProviderId: providerId,
        activeModelId: modelId,
      },
    }
    this.getStore().set(nextSettings)
    return nextSettings
  }

  // Check if there is at least one enabled and configured provider
  hasEnabledAiProvider(): boolean {
    const { ai } = this.get()
    return Object.values(ai.providers).some(
      p => p?.enabled && p.apiKey && p.selectedModelId,
    )
  }

  // Check if active provider is valid
  isActiveProviderValid(): boolean {
    const { ai } = this.get()
    if (!ai.activeProviderId || !ai.activeModelId)
      return false
    const provider = ai.providers[ai.activeProviderId]
    return !!(
      provider?.enabled
      && provider.apiKey
      && provider.selectedModelId === ai.activeModelId
    )
  }

  // ===== Polish Methods =====

  setPolishEnabled(enabled: boolean): AppSettings {
    const current = this.get()
    const nextSettings: AppSettings = {
      ...current,
      polish: {
        ...current.polish,
        enabled,
      },
    }
    this.getStore().set(nextSettings)
    return nextSettings
  }

  setSelectedPolishCommand(commandId: string | null): AppSettings {
    const current = this.get()
    const nextSettings: AppSettings = {
      ...current,
      polish: {
        ...current.polish,
        selectedCommandId: commandId,
      },
    }
    this.getStore().set(nextSettings)
    return nextSettings
  }

  updatePolishSettings(payload: {
    temperature?: number
    maxTokens?: number
  }): AppSettings {
    const current = this.get()
    const nextSettings: AppSettings = {
      ...current,
      polish: {
        ...current.polish,
        ...(typeof payload.temperature === 'number'
          ? { temperature: clampPolishTemperature(payload.temperature) }
          : {}),
        ...(typeof payload.maxTokens === 'number'
          ? { maxTokens: clampPolishMaxTokens(payload.maxTokens) }
          : {}),
      },
    }
    this.getStore().set(nextSettings)
    return nextSettings
  }

  addCustomPolishCommand(command: Omit<PolishCommand, 'isBuiltIn'>): AppSettings {
    const current = this.get()
    const newCommand: PolishCommand = {
      ...command,
      isBuiltIn: false,
    }
    const nextSettings: AppSettings = {
      ...current,
      polish: {
        ...current.polish,
        customCommands: [...current.polish.customCommands, newCommand],
      },
    }
    this.getStore().set(nextSettings)
    return nextSettings
  }

  removeCustomPolishCommand(commandId: string): AppSettings {
    const current = this.get()
    const nextSettings: AppSettings = {
      ...current,
      polish: {
        ...current.polish,
        customCommands: current.polish.customCommands.filter(
          c => c.id !== commandId,
        ),
        // Clear selected if removed command was selected
        selectedCommandId:
          current.polish.selectedCommandId === commandId
            ? null
            : current.polish.selectedCommandId,
      },
    }
    this.getStore().set(nextSettings)
    return nextSettings
  }

  // Get all available polish commands (built-in + custom)
  getAllPolishCommands(): PolishCommand[] {
    const { polish } = this.get()
    return [...BUILT_IN_POLISH_COMMANDS, ...polish.customCommands].sort(
      (a, b) => a.order - b.order,
    )
  }

  // ===== Migration & Defaults =====

  private mergeDefaults(parsed: Partial<AppSettings>): AppSettings {
    // Handle migration from v1
    if ('aiProviders' in (parsed as object) && !('ai' in (parsed as object))) {
      parsed = this.migrateFromV1(parsed as Record<string, unknown>)
    }

    const parsedVad = parsed.voice?.vad
    const parsedOnboarding = parsed.onboarding
    const parsedAi = parsed.ai
    const parsedPolish = parsed.polish

    return {
      version: 2,
      onboarding: {
        completed:
          parsedOnboarding?.completed
          ?? DEFAULT_SETTINGS.onboarding.completed,
        skippedSteps: Array.isArray(parsedOnboarding?.skippedSteps)
          ? parsedOnboarding.skippedSteps
          : DEFAULT_SETTINGS.onboarding.skippedSteps,
      },
      voice: {
        continueWindowMs: clampContinueWindow(
          typeof parsed.voice?.continueWindowMs === 'number'
            ? parsed.voice.continueWindowMs
            : DEFAULT_SETTINGS.voice.continueWindowMs,
        ),
        vad: {
          enabled:
            typeof parsedVad?.enabled === 'boolean'
              ? parsedVad.enabled
              : DEFAULT_VAD.enabled,
          threshold:
            typeof parsedVad?.threshold === 'number'
              ? clampVadThreshold(parsedVad.threshold)
              : DEFAULT_VAD.threshold,
          minSpeechMs:
            typeof parsedVad?.minSpeechMs === 'number'
              ? clampVadMinSpeechMs(parsedVad.minSpeechMs)
              : DEFAULT_VAD.minSpeechMs,
          redemptionMs:
            typeof parsedVad?.redemptionMs === 'number'
              ? clampVadRedemptionMs(parsedVad.redemptionMs)
              : DEFAULT_VAD.redemptionMs,
          minDurationMs:
            typeof parsedVad?.minDurationMs === 'number'
              ? clampVadMinDurationMs(parsedVad.minDurationMs)
              : DEFAULT_VAD.minDurationMs,
        },
      },
      ai: {
        providers: (parsedAi?.providers as AiSettings['providers']) ?? {},
        activeProviderId: (parsedAi?.activeProviderId as ProviderKey) ?? null,
        activeModelId: parsedAi?.activeModelId ?? null,
      },
      polish: {
        enabled: parsedPolish?.enabled ?? DEFAULT_SETTINGS.polish.enabled,
        selectedCommandId:
          parsedPolish?.selectedCommandId
          ?? DEFAULT_SETTINGS.polish.selectedCommandId,
        temperature: clampPolishTemperature(
          typeof parsedPolish?.temperature === 'number'
            ? parsedPolish.temperature
            : DEFAULT_SETTINGS.polish.temperature,
        ),
        maxTokens: clampPolishMaxTokens(
          typeof parsedPolish?.maxTokens === 'number'
            ? parsedPolish.maxTokens
            : DEFAULT_SETTINGS.polish.maxTokens,
        ),
        customCommands: Array.isArray(parsedPolish?.customCommands)
          ? parsedPolish.customCommands
          : [],
      },
      shortcuts: {
        pushToTalk:
          parsed.shortcuts?.pushToTalk
          ?? DEFAULT_SETTINGS.shortcuts.pushToTalk,
      },
    }
  }

  private migrateFromV1(v1: Record<string, unknown>): Partial<AppSettings> {
    // Simple migration: old array-based providers are discarded
    // Users need to reconfigure in the new format
    console.log('[SettingsStore] Migrating from v1 to v2')
    return {
      version: 2,
      onboarding: (v1.onboarding as OnboardingConfig) || DEFAULT_SETTINGS.onboarding,
      voice: (v1.voice as AppSettings['voice']) || DEFAULT_SETTINGS.voice,
      ai: {
        providers: {},
        activeProviderId: null,
        activeModelId: null,
      },
      polish: DEFAULT_SETTINGS.polish,
      shortcuts: (v1.shortcuts as AppSettings['shortcuts']) || DEFAULT_SETTINGS.shortcuts,
    }
  }
}

// Export singleton instance
export const settingsStore = new SettingsStore()

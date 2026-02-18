import type { VadConfig } from '~shared/voice'
import Store from 'electron-store'
import { DEFAULT_VAD_CONFIG } from '~shared/voice'

// Alias for backward compatibility - VadSettings is the same as VadConfig
export type VadSettings = VadConfig

const DEFAULT_VAD: VadSettings = { ...DEFAULT_VAD_CONFIG }

export interface AppSettings {
  version: 1
  voice: {
    continueWindowMs: number
    vad: VadSettings
  }
  aiProviders: {
    activeProviderId: string | null
    providers: Array<{
      id: string
      type: string
      baseUrl?: string
      model?: string
      enabled: boolean
    }>
  }
  shortcuts: {
    pushToTalk: string
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  voice: {
    continueWindowMs: 2000,
    vad: { ...DEFAULT_VAD },
  },
  aiProviders: {
    activeProviderId: null,
    providers: [],
  },
  shortcuts: {
    pushToTalk: 'Ctrl+Z',
  },
}

function clampContinueWindow(value: number): number {
  const next = Number.isFinite(value) ? Math.round(value) : DEFAULT_SETTINGS.voice.continueWindowMs
  return Math.min(8000, Math.max(200, next))
}

function clampVadThreshold(value: number): number {
  const next = Number.isFinite(value) ? value : DEFAULT_VAD.threshold
  return Math.min(1, Math.max(0, next))
}

function clampVadMinSpeechMs(value: number): number {
  const next = Number.isFinite(value) ? Math.round(value) : DEFAULT_VAD.minSpeechMs
  return Math.min(2000, Math.max(50, next))
}

function clampVadRedemptionMs(value: number): number {
  const next = Number.isFinite(value) ? Math.round(value) : DEFAULT_VAD.redemptionMs
  return Math.min(2000, Math.max(50, next))
}

function clampVadMinDurationMs(value: number): number {
  const next = Number.isFinite(value) ? Math.round(value) : DEFAULT_VAD.minDurationMs
  return Math.min(5000, Math.max(100, next))
}

export class SettingsStore {
  private store: Store<AppSettings> | null = null

  private getStore(): Store<AppSettings> {
    if (this.store)
      return this.store
    const StoreCtor = (Store as unknown as { default?: typeof Store }).default ?? Store
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
    store.set(merged)
    return merged
  }

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
      ...(typeof payload.enabled === 'boolean' ? { enabled: payload.enabled } : {}),
      ...(typeof payload.threshold === 'number' ? { threshold: clampVadThreshold(payload.threshold) } : {}),
      ...(typeof payload.minSpeechMs === 'number' ? { minSpeechMs: clampVadMinSpeechMs(payload.minSpeechMs) } : {}),
      ...(typeof payload.redemptionMs === 'number' ? { redemptionMs: clampVadRedemptionMs(payload.redemptionMs) } : {}),
      ...(typeof payload.minDurationMs === 'number' ? { minDurationMs: clampVadMinDurationMs(payload.minDurationMs) } : {}),
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

  private mergeDefaults(parsed: Partial<AppSettings>): AppSettings {
    const parsedVad = parsed.voice?.vad
    return {
      version: 1,
      voice: {
        continueWindowMs: clampContinueWindow(
          typeof parsed.voice?.continueWindowMs === 'number'
            ? parsed.voice.continueWindowMs
            : DEFAULT_SETTINGS.voice.continueWindowMs,
        ),
        vad: {
          enabled: typeof parsedVad?.enabled === 'boolean' ? parsedVad.enabled : DEFAULT_VAD.enabled,
          threshold: typeof parsedVad?.threshold === 'number' ? clampVadThreshold(parsedVad.threshold) : DEFAULT_VAD.threshold,
          minSpeechMs: typeof parsedVad?.minSpeechMs === 'number' ? clampVadMinSpeechMs(parsedVad.minSpeechMs) : DEFAULT_VAD.minSpeechMs,
          redemptionMs: typeof parsedVad?.redemptionMs === 'number' ? clampVadRedemptionMs(parsedVad.redemptionMs) : DEFAULT_VAD.redemptionMs,
          minDurationMs: typeof parsedVad?.minDurationMs === 'number' ? clampVadMinDurationMs(parsedVad.minDurationMs) : DEFAULT_VAD.minDurationMs,
        },
      },
      aiProviders: {
        activeProviderId: parsed.aiProviders?.activeProviderId ?? null,
        providers: Array.isArray(parsed.aiProviders?.providers) ? parsed.aiProviders!.providers : [],
      },
      shortcuts: {
        pushToTalk: parsed.shortcuts?.pushToTalk || DEFAULT_SETTINGS.shortcuts.pushToTalk,
      },
    }
  }
}

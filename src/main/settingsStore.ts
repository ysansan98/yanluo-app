import Store from 'electron-store'

export interface AppSettings {
  version: 1
  voice: {
    continueWindowMs: number
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

  private mergeDefaults(parsed: Partial<AppSettings>): AppSettings {
    return {
      version: 1,
      voice: {
        continueWindowMs: clampContinueWindow(
          typeof parsed.voice?.continueWindowMs === 'number'
            ? parsed.voice.continueWindowMs
            : DEFAULT_SETTINGS.voice.continueWindowMs,
        ),
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

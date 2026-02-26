import type { BrowserWindow } from 'electron'
import type { VadConfig } from '~shared/voice'
import type { AsrService } from './asrService'
import type { HistoryStore } from './historyStore'
import type { ModelDownloader } from './modelManager'
import type { SettingsStore } from './settingsStore'
import type { PermissionChecker, SessionOrchestrator } from './voice/types'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import process from 'node:process'
import { BrowserWindow as BW, clipboard, ipcMain } from 'electron'
import { VAD_CONFIG_IPC } from '~shared/voice'
import { getModelDir, getModelId, modelExists } from './modelManager'
import { polishEngine } from './polish/polishEngine'

interface RegisterIpcHandlersOptions {
  asrService: AsrService
  historyStore: HistoryStore
  modelDownloader: ModelDownloader
  sessionOrchestrator: SessionOrchestrator
  settingsStore: SettingsStore
  permissionChecker: PermissionChecker
  getMainWindow: () => BrowserWindow | null
  /**
   * 引导完成后的回调，用于初始化热键等操作
   */
  onOnboardingComplete?: () => void
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const {
    asrService,
    getMainWindow,
    historyStore,
    modelDownloader,
    sessionOrchestrator,
    settingsStore,
    permissionChecker,
    onOnboardingComplete,
  } = options

  ipcMain.handle('asr:health', async () => asrService.health())
  ipcMain.handle('asr:modelInfo', async () => ({
    modelId: getModelId(),
    modelDir: getModelDir(),
    exists: modelExists(),
  }))
  ipcMain.handle('asr:downloadModel', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow)
      throw new Error('Window not ready')
    if (modelExists())
      return { status: 'exists' as const }
    if (modelDownloader.running)
      return { status: 'running' as const }
    await modelDownloader.start(mainWindow)
    return { status: 'ok' as const }
  })
  ipcMain.handle('voice:recording:start', async () => {
    console.log('[!!!] IPC voice:recording:start CALLED !!!')
    // 检查全局禁用状态（用于 onboarding 设置快捷键时）
    const { isHotkeyDisabledGlobally } = await import('./voice/hotkeyState')
    if (isHotkeyDisabledGlobally()) {
      console.log('[!!!] IPC voice:recording:start BLOCKED by global disable')
      return { ok: false as const, reason: 'hotkey_disabled' }
    }
    await sessionOrchestrator.handleHotkeyPress()
    return { ok: true as const }
  })
  ipcMain.handle('voice:recording:stop', async () => {
    await sessionOrchestrator.handleHotkeyRelease()
    return { ok: true as const }
  })
  ipcMain.handle('voice:getConfig', async () => ({
    continueWindowMs: settingsStore.get().voice.continueWindowMs,
  }))
  ipcMain.handle(
    'voice:setConfig',
    async (_event, payload: { continueWindowMs?: number }) => {
      if (typeof payload?.continueWindowMs === 'number') {
        const updated = settingsStore.updateVoiceSettings({
          continueWindowMs: payload.continueWindowMs,
        })
        sessionOrchestrator.setContinueWindowMs?.(
          updated.voice.continueWindowMs,
        )
      }
      else {
        sessionOrchestrator.setContinueWindowMs?.(
          settingsStore.get().voice.continueWindowMs,
        )
      }
      return {
        ok: true as const,
        continueWindowMs: settingsStore.get().voice.continueWindowMs,
      }
    },
  )
  ipcMain.handle(VAD_CONFIG_IPC.GET, async () => ({
    ...settingsStore.get().voice.vad,
  }))
  ipcMain.handle(
    VAD_CONFIG_IPC.SET,
    async (_event, payload: Partial<VadConfig>) => {
      const updated = settingsStore.updateVadSettings(payload)
      // Notify all renderer windows of config update
      const mainWindow = getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send(VAD_CONFIG_IPC.UPDATED, updated.voice.vad)
      }
      return {
        ok: true as const,
        ...updated.voice.vad,
      }
    },
  )
  ipcMain.handle(
    'history:create',
    async (
      _event,
      payload: {
        source: 'live'
        entryType: 'asr_only' | 'polish'
        commandName?: string | null
        text: string
        language?: string
        elapsedMs?: number
        audioPath?: string | null
        triggeredAt?: number
      },
    ) => {
      const entry = await historyStore.create(payload)
      // 广播给所有渲染进程
      BW.getAllWindows().forEach((win) => {
        win.webContents.send('history:created', entry)
      })
      return entry
    },
  )
  ipcMain.handle('history:list', async (_event, payload?: { limit?: number }) =>
    historyStore.list(payload?.limit ?? 200))
  ipcMain.handle('history:clear', async () => {
    historyStore.clear()
    return { ok: true as const }
  })
  ipcMain.handle(
    'history:readAudio',
    async (_event, payload: { path: string }) => {
      const rawPath = payload?.path?.trim()
      if (!rawPath)
        return { ok: false as const, message: 'empty path' }
      if (!existsSync(rawPath))
        return { ok: false as const, message: 'file not found' }

      const ext = extname(rawPath).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac',
        '.ogg': 'audio/ogg',
        '.webm': 'audio/webm',
      }
      const mime = mimeMap[ext] ?? 'application/octet-stream'
      const data = readFileSync(rawPath)
      return {
        ok: true as const,
        mime,
        base64: data.toString('base64'),
      }
    },
  )

  // Onboarding 相关 IPC
  ipcMain.handle('onboarding:getStatus', async () => ({
    completed: settingsStore.get().onboarding.completed,
    skippedSteps: settingsStore.get().onboarding.skippedSteps,
  }))

  ipcMain.handle('onboarding:complete', async () => {
    settingsStore.completeOnboarding()
    // 调用回调函数，通知引导已完成（用于延迟初始化热键等操作）
    onOnboardingComplete?.()
    return { ok: true as const }
  })

  ipcMain.handle('onboarding:skipStep', async (_event, stepId: string) => {
    settingsStore.skipOnboardingStep(stepId)
    return { ok: true as const }
  })

  ipcMain.handle('onboarding:reset', async () => {
    settingsStore.resetOnboarding()
    return { ok: true as const }
  })

  // 权限相关 IPC
  ipcMain.handle(
    'permission:check',
    async (_event, kind: 'MICROPHONE' | 'ACCESSIBILITY') => {
      return permissionChecker.check(kind)
    },
  )

  ipcMain.handle(
    'permission:request',
    async (_event, kind: 'MICROPHONE' | 'ACCESSIBILITY') => {
      return permissionChecker.ensureOrPrompt(kind)
    },
  )

  // 快捷键相关 IPC
  ipcMain.handle('shortcut:get', async () => {
    return settingsStore.getShortcut()
  })

  ipcMain.handle('shortcut:set', async (_event, shortcut: string | null) => {
    settingsStore.setShortcut(shortcut)
    // 通知 sessionOrchestrator 更新快捷键配置（热更新，无需重启）
    // 支持清空快捷键（设置为 null）
    sessionOrchestrator.updateShortcut?.(shortcut ?? '')
    return { ok: true as const }
  })

  // 复制文本到剪贴板（替代 navigator.clipboard，避免权限问题）
  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    try {
      clipboard.writeText(text)
      return { ok: true as const }
    }
    catch (err) {
      console.error('[ipc] clipboard:writeText failed:', err)
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // 全局快捷键控制（用于设置快捷键步骤时临时禁用）
  ipcMain.handle('shortcut:disableGlobal', async () => {
    console.log('[ipc] handle shortcut:disableGlobal called')
    const { setHotkeyDisabledGlobally } = await import('./voice/hotkeyState')
    setHotkeyDisabledGlobally(true)
    return { ok: true as const }
  })

  ipcMain.handle('shortcut:enableGlobal', async () => {
    const { setHotkeyDisabledGlobally } = await import('./voice/hotkeyState')
    setHotkeyDisabledGlobally(false)
    return { ok: true as const }
  })

  // 初始化热键（用于引导流程中快捷键设置完成后）
  ipcMain.handle('shortcut:initHotkey', async () => {
    console.log('[ipc] handle shortcut:initHotkey called')
    if (onOnboardingComplete) {
      await onOnboardingComplete()
    }
    return { ok: true as const }
  })

  // ===== AI Provider IPC =====

  // Load AI provider registry from models.dev/api.json
  ipcMain.handle('ai:getRegistry', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { app } = await import('electron')
    const apiJsonPath = join(app.getAppPath(), 'models.dev', 'api.json')
    const content = readFileSync(apiJsonPath, 'utf-8')
    const providers = JSON.parse(content)
    return { providers }
  })

  // Get user's AI configuration
  ipcMain.handle('ai:getConfig', async () => {
    const settings = settingsStore.get()
    // Mask API keys for security
    const maskedProviders: typeof settings.ai.providers = {}
    for (const [key, provider] of Object.entries(settings.ai.providers)) {
      if (provider) {
        maskedProviders[key as keyof typeof maskedProviders] = {
          ...provider,
          apiKey: provider.apiKey ? '********' : '',
        }
      }
    }
    return {
      providers: maskedProviders,
      activeProviderId: settings.ai.activeProviderId,
      activeModelId: settings.ai.activeModelId,
    }
  })

  // Set provider configuration
  ipcMain.handle(
    'ai:setProviderConfig',
    async (_event, providerId: string, config: { apiKey?: string, customApiEndpoint?: string, selectedModelId?: string }) => {
      const settings = settingsStore.get()
      const existing = settings.ai.providers[providerId as keyof typeof settings.ai.providers]

      // If apiKey is '********', keep the existing key
      const apiKey = config.apiKey === '********' && existing
        ? existing.apiKey
        : (config.apiKey || '')

      settingsStore.setAiProviderConfig(providerId as import('~shared/ai').ProviderKey, {
        enabled: true,
        apiKey,
        customApiEndpoint: config.customApiEndpoint,
        selectedModelId: config.selectedModelId,
      })
      return { ok: true as const }
    },
  )

  // Remove provider configuration
  ipcMain.handle('ai:removeProviderConfig', async (_event, providerId: string) => {
    settingsStore.removeAiProviderConfig(providerId as import('~shared/ai').ProviderKey)
    return { ok: true as const }
  })

  // Set active provider
  ipcMain.handle(
    'ai:setActiveProvider',
    async (_event, providerId: string | null, modelId: string | null) => {
      settingsStore.setActiveProvider(
        providerId as import('~shared/ai').ProviderKey | null,
        modelId,
      )
      return { ok: true as const }
    },
  )

  // Check if AI provider is configured
  ipcMain.handle('ai:checkConfigured', async () => {
    return {
      hasEnabledProvider: settingsStore.hasEnabledAiProvider(),
      isActiveProviderValid: settingsStore.isActiveProviderValid(),
    }
  })

  // ===== Polish IPC =====

  // Get polish configuration
  ipcMain.handle('polish:getConfig', async () => {
    const settings = settingsStore.get()
    return {
      enabled: settings.polish.enabled,
      selectedCommandId: settings.polish.selectedCommandId,
      temperature: settings.polish.temperature,
      maxTokens: settings.polish.maxTokens,
    }
  })

  // Set polish enabled
  ipcMain.handle('polish:setEnabled', async (_event, enabled: boolean) => {
    settingsStore.setPolishEnabled(enabled)
    return { ok: true as const }
  })

  // Set selected polish command
  ipcMain.handle('polish:setCommand', async (_event, commandId: string | null) => {
    settingsStore.setSelectedPolishCommand(commandId)
    return { ok: true as const }
  })

  // Get all polish commands (built-in + custom)
  ipcMain.handle('polish:getCommands', async () => {
    return settingsStore.getAllPolishCommands()
  })

  // Add custom polish command
  ipcMain.handle('polish:addCommand', async (_event, command: {
    id: string
    name: string
    promptTemplate: string
    icon?: string
    order?: number
  }) => {
    settingsStore.addCustomPolishCommand({
      ...command,
      order: command.order ?? 100,
    })
    return { ok: true }
  })

  // Remove custom polish command
  ipcMain.handle('polish:removeCommand', async (_event, commandId: string) => {
    settingsStore.removeCustomPolishCommand(commandId)
    return { ok: true }
  })

  // Update polish settings
  ipcMain.handle(
    'polish:updateSettings',
    async (_event, payload: { temperature?: number, maxTokens?: number }) => {
      settingsStore.updatePolishSettings(payload)
      return { ok: true as const }
    },
  )

  // ===== AI Validation IPC =====

  // Validate provider configuration with test request
  ipcMain.handle(
    'ai:validateProvider',
    async (_event, providerId: string, modelId: string) => {
      const result = await polishEngine.validateProvider(
        providerId as import('~shared/ai').ProviderKey,
        modelId,
      )
      return result
    },
  )

  // E2E 测试专用：模拟系统级快捷键触发（仅在 NODE_ENV=test 下启用）
  if (process.env.NODE_ENV === 'test') {
    ipcMain.handle('test:shortcut:triggerHub', async () => {
      await sessionOrchestrator.handleHotkeyPress({
        skipPrerequisiteChecks: true,
        testUiOnly: true,
      })
      return { ok: true as const }
    })
  }
}

import type { BrowserWindow } from 'electron'
import type { AsrService } from './asrService'
import type { HistoryStore } from './historyStore'
import type { ModelDownloader } from './modelManager'
import type { SettingsStore } from './settingsStore'
import type { PermissionChecker, SessionOrchestrator } from './voice/types'
import type { VoiceHudManager } from './voiceHud/voiceHudManager'
import { screen } from 'electron'
import { setupMediaPermissionHandlers } from './permissions/mediaPermissions'
import { registerIpcHandlers } from './registerIpcHandlers'

interface CreateMainAppHandlersOptions {
  asrService: AsrService
  historyStore: HistoryStore
  modelDownloader: ModelDownloader
  sessionOrchestrator: SessionOrchestrator
  settingsStore: SettingsStore
  permissionChecker: PermissionChecker
  voiceHudManager: VoiceHudManager
  createMainWindow: () => BrowserWindow
  getMainWindow: () => BrowserWindow | null
  setMainWindow: (window: BrowserWindow) => void
}

interface MainAppHandlers {
  onReady: () => void
  onActivate: () => void
  onBeforeQuit: () => void
}

export function createMainAppHandlers(
  options: CreateMainAppHandlersOptions,
): MainAppHandlers {
  const {
    asrService,
    historyStore,
    createMainWindow,
    getMainWindow,
    modelDownloader,
    permissionChecker,
    sessionOrchestrator,
    settingsStore,
    setMainWindow,
    voiceHudManager,
  } = options

  return {
    onReady: () => {
      setupMediaPermissionHandlers()

      registerIpcHandlers({
        asrService,
        historyStore,
        modelDownloader,
        sessionOrchestrator,
        settingsStore,
        permissionChecker,
        getMainWindow,
      })

      asrService.start().catch((err) => {
        console.error('Failed to start ASR service:', err)
      })
      sessionOrchestrator.setContinueWindowMs?.(
        settingsStore.get().voice.continueWindowMs,
      )
      sessionOrchestrator.init().catch((err) => {
        console.error('Failed to initialize voice session orchestrator:', err)
      })

      const mainWindow = createMainWindow()
      setMainWindow(mainWindow)

      // 检查是否需要显示引导页
      const onboardingConfig = settingsStore.get().onboarding
      if (!onboardingConfig.completed) {
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow.webContents.send('app:showOnboarding')
        })
      }

      // 通过 VoiceHudManager 初始化 HUD（唯一入口）
      voiceHudManager.init()

      // 屏幕变化时更新 HUD 位置
      screen.on('display-metrics-changed', () =>
        voiceHudManager.updateBounds())
      screen.on('display-added', () => voiceHudManager.updateBounds())
      screen.on('display-removed', () => voiceHudManager.updateBounds())
    },
    onActivate: () => {
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed())
        setMainWindow(createMainWindow())
      // HUD 窗口的生命周期由 VoiceHudManager 内部管理
      // 如果需要重新创建，VoiceHudManager 会在 ensureVisible 时自动处理
    },
    onBeforeQuit: () => {
      // 通过 VoiceHudManager 销毁 HUD（唯一入口）
      voiceHudManager.dispose()
      asrService.stop()
      sessionOrchestrator.dispose().catch((err) => {
        console.error('Failed to dispose voice session orchestrator:', err)
      })
    },
  }
}

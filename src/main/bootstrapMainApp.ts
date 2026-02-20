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
  /**
   * 延迟初始化热键（在引导完成后调用，避免启动时立即请求辅助功能权限）
   */
  initHotkey?: () => Promise<void>
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

  const { initHotkey } = options

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
        onOnboardingComplete: () => {
          // 引导完成后初始化热键
          if (initHotkey) {
            void initHotkey().catch((err) => {
              console.error('Failed to initialize hotkey after onboarding:', err)
            })
          }
        },
      })

      asrService.start().catch((err) => {
        console.error('Failed to start ASR service:', err)
      })
      sessionOrchestrator.setContinueWindowMs?.(
        settingsStore.get().voice.continueWindowMs,
      )
      // 延迟热键初始化，避免启动时立即请求辅助功能权限
      sessionOrchestrator.init({ delayHotkey: true }).catch((err) => {
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

      // 延迟初始化热键，避免启动时立即请求辅助功能权限
      // 如果引导已完成，页面加载后延迟初始化；如果引导未完成，在引导完成后通过回调初始化
      if (onboardingConfig.completed) {
        // 引导已完成，页面加载后延迟 2 秒初始化热键
        mainWindow.webContents.once('did-finish-load', () => {
          setTimeout(() => {
            if (initHotkey) {
              void initHotkey().catch((err) => {
                console.error('Failed to initialize hotkey:', err)
              })
            }
          }, 2000)
        })
      }
      // 如果引导未完成，onOnboardingComplete 回调会在引导完成后调用 initHotkey

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

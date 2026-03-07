import type { BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import type { AsrService } from './asrService'
import type { HistoryStore } from './historyStore'
import type { ModelDownloader } from './modelManager'
import type { SettingsStore } from './settingsStore'
import type { PermissionChecker, SessionOrchestrator } from './voice/types'
import type { VoiceHudManager } from './voiceHud/voiceHudManager'
import type { VoiceWorkerWindowController } from './windows/voiceWorkerWindow'
import process from 'node:process'
import { app, screen } from 'electron'
import { setupMediaPermissionHandlers } from './permissions/mediaPermissions'
import { registerIpcHandlers } from './registerIpcHandlers'
import { StatusBarTray } from './statusBarTray'
import { setHotkeyDisabledGlobally } from './voice/hotkeyState'

interface CreateMainAppHandlersOptions {
  asrService: AsrService
  historyStore: HistoryStore
  modelDownloader: ModelDownloader
  sessionOrchestrator: SessionOrchestrator
  settingsStore: SettingsStore
  permissionChecker: PermissionChecker
  voiceHudManager: VoiceHudManager
  voiceWorkerWindow: VoiceWorkerWindowController
  createMainWindow: () => BrowserWindow
  getMainWindow: () => BrowserWindow | null
  setMainWindow: (window: BrowserWindow) => void
  /**
   * 初始化热键
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
    voiceWorkerWindow,
  } = options

  const { initHotkey } = options
  const statusBarTray = new StatusBarTray()
  let quitWatchdogArmed = false

  const armQuitWatchdog = () => {
    if (quitWatchdogArmed)
      return
    quitWatchdogArmed = true

    const pid = process.pid
    const cmd = `sleep 2; kill -0 ${pid} >/dev/null 2>&1 && kill -9 ${pid} >/dev/null 2>&1 || true`
    const helper = spawn('/bin/sh', ['-c', cmd], {
      detached: true,
      stdio: 'ignore',
    })
    helper.unref()
  }

  const quitAppFromTray = () => {
    setHotkeyDisabledGlobally(true)
    statusBarTray.destroy()
    armQuitWatchdog()
    app.quit()
  }

  const ensureTray = () => {
    statusBarTray.create({
      getMainWindow,
      createMainWindow,
      setMainWindow,
      onQuit: quitAppFromTray,
    })
  }

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
      // 默认不在 init 阶段绑定热键，由后续流程显式初始化
      sessionOrchestrator.init({ delayHotkey: true }).catch((err) => {
        console.error('Failed to initialize voice session orchestrator:', err)
      })
      ensureTray()

      // 检查是否需要显示引导页
      const onboardingConfig = settingsStore.get().onboarding
      if (!onboardingConfig.completed) {
        const mainWindow = createMainWindow()
        setMainWindow(mainWindow)
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow.webContents.send('app:showOnboarding')
        })
      }
      else if (process.platform === 'darwin') {
        // 已完成引导时默认后台常驻，仅通过状态栏打开主窗口。
        app.dock?.hide()
      }

      if (onboardingConfig.completed) {
        const configuredShortcut = settingsStore.getShortcut()
        if (configuredShortcut && initHotkey) {
          void initHotkey().catch((err) => {
            console.error('Failed to initialize hotkey:', err)
          })
        }
      }
      // 如果引导未完成，onOnboardingComplete 回调会在引导完成后调用 initHotkey

      // 通过 VoiceHudManager 初始化 HUD（唯一入口）
      voiceHudManager.init()
      voiceWorkerWindow.init()

      // 屏幕变化时更新 HUD 位置
      screen.on('display-metrics-changed', () =>
        voiceHudManager.updateBounds())
      screen.on('display-added', () => voiceHudManager.updateBounds())
      screen.on('display-removed', () => voiceHudManager.updateBounds())
    },
    onActivate: () => {
      ensureTray()
      if (settingsStore.get().onboarding.completed) {
        return
      }
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed())
        setMainWindow(createMainWindow())
      // HUD 窗口的生命周期由 VoiceHudManager 内部管理
      // 如果需要重新创建，VoiceHudManager 会在 ensureVisible 时自动处理
    },
    onBeforeQuit: () => {
      setHotkeyDisabledGlobally(true)
      armQuitWatchdog()
      statusBarTray.destroy()
      // 通过 VoiceHudManager 销毁 HUD（唯一入口）
      voiceHudManager.dispose()
      voiceWorkerWindow.dispose()
      asrService.stop()
      sessionOrchestrator.dispose().catch((err) => {
        console.error('Failed to dispose voice session orchestrator:', err)
      })
    },
  }
}

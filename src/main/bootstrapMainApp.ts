import type { BrowserWindow } from 'electron'
import type { AsrService } from './asrService'
import type { HistoryStore } from './historyStore'
import type { ModelDownloader } from './modelManager'
import type { SettingsStore } from './settingsStore'
import type { SessionOrchestrator } from './voice/types'
import type { VoiceHudWindowController } from './windows/voiceHudWindow'
import { screen } from 'electron'
import { setupMediaPermissionHandlers } from './permissions/mediaPermissions'
import { registerIpcHandlers } from './registerIpcHandlers'

interface CreateMainAppHandlersOptions {
  asrService: AsrService
  historyStore: HistoryStore
  modelDownloader: ModelDownloader
  sessionOrchestrator: SessionOrchestrator
  settingsStore: SettingsStore
  voiceHudController: VoiceHudWindowController
  createMainWindow: () => BrowserWindow
  getMainWindow: () => BrowserWindow | null
  setMainWindow: (window: BrowserWindow) => void
}

interface MainAppHandlers {
  onReady: () => void
  onActivate: () => void
  onBeforeQuit: () => void
}

export function createMainAppHandlers(options: CreateMainAppHandlersOptions): MainAppHandlers {
  const {
    asrService,
    historyStore,
    createMainWindow,
    getMainWindow,
    modelDownloader,
    sessionOrchestrator,
    settingsStore,
    setMainWindow,
    voiceHudController,
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
        getMainWindow,
      })

      asrService.start().catch((err) => {
        console.error('Failed to start ASR service:', err)
      })
      sessionOrchestrator.setContinueWindowMs?.(settingsStore.get().voice.continueWindowMs)
      sessionOrchestrator.init().catch((err) => {
        console.error('Failed to initialize voice session orchestrator:', err)
      })

      setMainWindow(createMainWindow())
      voiceHudController.create()
      screen.on('display-metrics-changed', () => voiceHudController.updateBounds())
      screen.on('display-added', () => voiceHudController.updateBounds())
      screen.on('display-removed', () => voiceHudController.updateBounds())
    },
    onActivate: () => {
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed())
        setMainWindow(createMainWindow())
      if (!voiceHudController.getWindow())
        voiceHudController.create()
    },
    onBeforeQuit: () => {
      voiceHudController.dispose()
      asrService.stop()
      sessionOrchestrator.dispose().catch((err) => {
        console.error('Failed to dispose voice session orchestrator:', err)
      })
    },
  }
}

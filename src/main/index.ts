import type { BrowserWindow } from 'electron'
import { screen } from 'electron'
import icon from '../../resources/icon.png?asset'
import { registerAppLifecycle } from './appLifecycle'
import { AsrService } from './asrService'
import { ModelDownloader } from './modelManager'
import { setupMediaPermissionHandlers } from './permissions/mediaPermissions'
import { registerIpcHandlers } from './registerIpcHandlers'
import { createVoiceRuntime, VOICE_IPC } from './voice'
import { createMainWindow } from './windows/mainWindow'
import { VoiceHudWindowController } from './windows/voiceHudWindow'

const asrService = new AsrService()
const modelDownloader = new ModelDownloader()
let mainWindow: BrowserWindow | null = null
const voiceHudController = new VoiceHudWindowController({ icon })

function broadcastVoiceUi(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
  const voiceHudWindow = voiceHudController.getWindow()
  if (voiceHudWindow) {
    voiceHudWindow.webContents.send(channel, payload)
  }
}

const { hotkeyManager, sessionOrchestrator } = createVoiceRuntime({
  asrBaseUrl: asrService.baseUrl,
  getTargetWebContents: () => mainWindow?.webContents ?? null,
  onUiShow: (payload) => {
    voiceHudController.ensureVisible()
    broadcastVoiceUi(VOICE_IPC.UI_SHOW, payload)
  },
  onUiUpdate: (payload) => {
    voiceHudController.ensureVisible()
    broadcastVoiceUi(VOICE_IPC.UI_UPDATE, payload)
  },
  onUiFinal: (payload) => {
    voiceHudController.ensureVisible()
    voiceHudController.scheduleHide(2200)
    broadcastVoiceUi(VOICE_IPC.UI_FINAL, payload)
  },
  onUiHide: () => {
    voiceHudController.scheduleHide(300)
    broadcastVoiceUi(VOICE_IPC.UI_HIDE)
  },
  onUiToast: (payload) => {
    voiceHudController.ensureVisible()
    voiceHudController.scheduleHide(payload.type === 'error' ? 2200 : 1600)
    broadcastVoiceUi(VOICE_IPC.UI_TOAST, payload)
  },
})

registerAppLifecycle({
  onReady: () => {
    setupMediaPermissionHandlers()

    registerIpcHandlers({
      asrService,
      modelDownloader,
      sessionOrchestrator,
      getMainWindow: () => {
        if (!mainWindow || mainWindow.isDestroyed())
          return null
        return mainWindow
      },
    })

    asrService.start().catch((err) => {
      console.error('Failed to start ASR service:', err)
    })
    sessionOrchestrator.init().catch((err) => {
      console.error('Failed to initialize voice session orchestrator:', err)
    })

    mainWindow = createMainWindow({ icon })
    voiceHudController.create()
    screen.on('display-metrics-changed', () => voiceHudController.updateBounds())
    screen.on('display-added', () => voiceHudController.updateBounds())
    screen.on('display-removed', () => voiceHudController.updateBounds())
  },
  onBrowserWindowCreated: (window) => {
    window.on('blur', () => {
      hotkeyManager.reset('window-blur')
    })
  },
  onActivate: () => {
    if (!mainWindow || mainWindow.isDestroyed())
      mainWindow = createMainWindow({ icon })
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
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

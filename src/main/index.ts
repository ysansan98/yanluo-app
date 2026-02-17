import type { BrowserWindow } from 'electron'
import icon from '../../resources/icon.png?asset'
import { registerAppLifecycle } from './appLifecycle'
import { AsrService } from './asrService'
import { createMainAppHandlers } from './bootstrapMainApp'
import { HistoryStore } from './historyStore'
import { ModelDownloader } from './modelManager'
import { SettingsStore } from './settingsStore'
import { createVoiceRuntime, VOICE_IPC } from './voice'
import { createMainWindow } from './windows/mainWindow'
import { VoiceHudWindowController } from './windows/voiceHudWindow'

const asrService = new AsrService()
const historyStore = new HistoryStore()
const modelDownloader = new ModelDownloader()
const settingsStore = new SettingsStore()
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

const appHandlers = createMainAppHandlers({
  asrService,
  historyStore,
  modelDownloader,
  sessionOrchestrator,
  settingsStore,
  voiceHudController,
  createMainWindow: () => createMainWindow({ icon }),
  getMainWindow: () => {
    if (!mainWindow || mainWindow.isDestroyed())
      return null
    return mainWindow
  },
  setMainWindow: (window) => {
    mainWindow = window
  },
})

registerAppLifecycle({
  onReady: appHandlers.onReady,
  onBrowserWindowCreated: (window) => {
    window.on('blur', () => {
      hotkeyManager.reset('window-blur')
    })
  },
  onActivate: appHandlers.onActivate,
  onBeforeQuit: appHandlers.onBeforeQuit,
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

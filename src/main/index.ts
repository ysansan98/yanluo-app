import type { BrowserWindow } from 'electron'
import process from 'node:process'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { app, screen, session } from 'electron'
import icon from '../../resources/icon.png?asset'
import { AsrService } from './asrService'
import { ModelDownloader } from './modelManager'
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

function setupMediaPermissionHandlers(): void {
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    if (permission === 'media') {
      const mediaType = (details as { mediaType?: string } | undefined)?.mediaType
      return mediaType === 'audio' || mediaType === undefined
    }
    return false
  })

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === 'media') {
      const mediaTypes = (details as { mediaTypes?: string[] } | undefined)?.mediaTypes ?? []
      callback(mediaTypes.length === 0 || mediaTypes.includes('audio'))
      return
    }
    callback(false)
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  setupMediaPermissionHandlers()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)

    window.on('blur', () => {
      hotkeyManager.reset('window-blur')
    })
  })

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

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (!mainWindow || mainWindow.isDestroyed())
      mainWindow = createMainWindow({ icon })
    if (!voiceHudController.getWindow())
      voiceHudController.create()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  voiceHudController.dispose()
  asrService.stop()
  sessionOrchestrator.dispose().catch((err) => {
    console.error('Failed to dispose voice session orchestrator:', err)
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

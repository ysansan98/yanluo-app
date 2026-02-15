import { join } from 'node:path'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import icon from '../../resources/icon.png?asset'
import { AsrService } from './asrService'
import { getModelDir, getModelId, ModelDownloader, modelExists } from './modelManager'
import {
  DefaultSessionOrchestrator,
  MacGlobalHotkeyManager,
  MacPermissionChecker,
  RendererAudioCapture,
  StubTextInjector,
  VOICE_IPC,
  WsStreamingAsrClient,
} from './voice'

const asrService = new AsrService()
const modelDownloader = new ModelDownloader()
const hotkeyManager = new MacGlobalHotkeyManager({
  log: (message, extra) => {
    console.info(`[voice-hotkey] ${message}`, extra ?? {})
  },
})
const audioCapture = new RendererAudioCapture({
  getTargetWebContents: () => mainWindow?.webContents ?? null,
  log: (message, extra) => {
    console.info(`[voice-audio] ${message}`, extra ?? {})
  },
})
const asrClient = new WsStreamingAsrClient({
  wsUrl: asrService.baseUrl.replace('http://', 'ws://').concat('/asr/stream'),
  log: (message, extra) => {
    console.info(`[voice-asr] ${message}`, extra ?? {})
  },
})
const permissionChecker = new MacPermissionChecker()
const textInjector = new StubTextInjector()
const sessionOrchestrator = new DefaultSessionOrchestrator({
  hotkeyManager,
  audioCapture,
  asrClient,
  textInjector,
  permissionChecker,
  enableHotkey: false,
  onUiShow: (payload) => {
    mainWindow?.webContents.send(VOICE_IPC.UI_SHOW, payload)
  },
  onUiUpdate: (payload) => {
    mainWindow?.webContents.send(VOICE_IPC.UI_UPDATE, payload)
  },
  onUiFinal: (payload) => {
    mainWindow?.webContents.send(VOICE_IPC.UI_FINAL, payload)
  },
  onUiHide: () => {
    mainWindow?.webContents.send(VOICE_IPC.UI_HIDE)
  },
  onUiToast: (payload) => {
    mainWindow?.webContents.send(VOICE_IPC.UI_TOAST, payload)
  },
  log: (message, extra) => {
    console.info(`[voice-session] ${message}`, extra ?? {})
  },
})
let mainWindow: BrowserWindow | null = null

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

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  }
  else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

  // IPC test
  ipcMain.on('ping', () => console.warn('pong'))
  ipcMain.handle('asr:health', async () => asrService.health())
  ipcMain.handle('asr:transcribeFile', async (_event, path: string, language?: string) => {
    const res = await asrService.transcribeFile(path, language)
    console.warn('[asr:transcribeFile] response', {
      language: res.language,
      textLength: res.text?.length ?? 0,
      elapsedMs: res.elapsed_ms,
    })
    return res
  })
  ipcMain.handle('asr:modelInfo', async () => ({
    modelId: getModelId(),
    modelDir: getModelDir(),
    exists: modelExists(),
  }))
  ipcMain.handle('asr:downloadModel', async () => {
    if (!mainWindow)
      throw new Error('Window not ready')
    if (modelExists())
      return { status: 'exists' as const }
    if (modelDownloader.running)
      return { status: 'running' as const }
    await modelDownloader.start(mainWindow)
    return { status: 'ok' as const }
  })
  ipcMain.handle('asr:pickAudioFile', async () => {
    if (!mainWindow)
      throw new Error('Window not ready')
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select audio file',
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'aac', 'webm'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0)
      return null
    return result.filePaths[0]
  })
  ipcMain.handle('voice:recording:start', async () => {
    await sessionOrchestrator.handleHotkeyPress()
    return { ok: true as const }
  })
  ipcMain.handle('voice:recording:stop', async () => {
    await sessionOrchestrator.handleHotkeyRelease()
    return { ok: true as const }
  })

  asrService.start().catch((err) => {
    console.error('Failed to start ASR service:', err)
  })
  sessionOrchestrator.init().catch((err) => {
    console.error('Failed to initialize voice session orchestrator:', err)
  })

  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
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
  asrService.stop()
  sessionOrchestrator.dispose().catch((err) => {
    console.error('Failed to dispose voice session orchestrator:', err)
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

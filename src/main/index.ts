import { join } from 'node:path'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain, session, shell, systemPreferences } from 'electron'
import icon from '../../resources/icon.png?asset'
import { AsrService } from './asrService'
import { getModelDir, getModelId, ModelDownloader, modelExists } from './modelManager'
import { MacGlobalHotkeyManager, RendererAudioCapture } from './voice'

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
let mainWindow: BrowserWindow | null = null
let captureChunkCount = 0

async function ensureMicrophoneAccess(): Promise<boolean> {
  if (process.platform !== 'darwin')
    return true

  const status = systemPreferences.getMediaAccessStatus('microphone')
  console.info('[voice-audio] microphone access status', { status })

  if (status === 'granted')
    return true

  const granted = await systemPreferences.askForMediaAccess('microphone')
  console.info('[voice-audio] askForMediaAccess result', { granted })
  return granted
}

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

  asrService.start().catch((err) => {
    console.error('Failed to start ASR service:', err)
  })
  audioCapture.onChunk((chunk) => {
    captureChunkCount += 1
    // Keep logs sparse to avoid flooding main process output.
    if (captureChunkCount % 25 === 0) {
      console.info('[voice-audio] streaming chunk progress', {
        chunkCount: captureChunkCount,
        timestampMs: chunk.timestampMs,
      })
    }
  })
  hotkeyManager.onPress(() => {
    console.info('[voice-hotkey] command+0 pressed')
    captureChunkCount = 0
    ensureMicrophoneAccess()
      .then((granted) => {
        if (!granted) {
          console.error('[voice-audio] microphone permission denied by system')
          return
        }
        return audioCapture.start()
      })
      .catch((err) => {
        console.error('[voice-audio] failed to start capture', err)
      })
  })
  hotkeyManager.onRelease(() => {
    console.info('[voice-hotkey] command+0 released')
    audioCapture.stop().catch((err) => {
      console.error('[voice-audio] failed to stop capture', err)
    })
  })
  hotkeyManager.onError((err) => {
    console.error('[voice-hotkey] unavailable', err)
  })
  hotkeyManager.start().catch((err) => {
    console.error('Failed to start global hotkey manager:', err)
  })

  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })

  app.on('browser-window-blur', () => {
    hotkeyManager.reset('app-will-resign-active')
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
  audioCapture.stop().catch((err) => {
    console.error('Failed to stop audio capture:', err)
  })
  hotkeyManager.stop().catch((err) => {
    console.error('Failed to stop global hotkey manager:', err)
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

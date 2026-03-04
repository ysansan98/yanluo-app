import type { NativeImage } from 'electron'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, shell } from 'electron'

interface CreateMainWindowOptions {
  icon?: NativeImage | string
}

export function createMainWindow(
  options: CreateMainWindowOptions,
): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 900,
    minHeight: 670,
    maxWidth: 900,
    maxHeight: 670,
    resizable: false,
    fullscreenable: false,
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
        }
      : {}),
    ...(process.platform === 'linux' && options.icon ? { icon: options.icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (process.platform === 'darwin') {
      app.dock?.show()
    }
  })

  mainWindow.on('closed', () => {
    if (process.platform === 'darwin') {
      app.dock?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  }
  else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

import type { WebContents } from 'electron'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'

/**
 * 隐藏的语音采集窗口控制器。
 * 仅承载 renderer 侧麦克风采集，不展示 UI。
 */
export class VoiceWorkerWindowController {
  private window: BrowserWindow | null = null

  init(): void {
    this.ensureWindow()
  }

  getWebContents(): WebContents | null {
    const win = this.ensureWindow()
    if (!win || win.isDestroyed())
      return null

    const { webContents } = win
    if (webContents.isDestroyed())
      return null

    return webContents
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }

  private ensureWindow(): BrowserWindow | null {
    if (this.window && !this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      return this.window
    }

    this.window = this.createWindow()
    return this.window
  }

  private createWindow(): BrowserWindow {
    const workerWindow = new BrowserWindow({
      width: 320,
      height: 240,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      void workerWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/voice-worker`)
    }
    else {
      void workerWindow.loadFile(
        join(__dirname, '../renderer/index.html'),
        { hash: '/voice-worker' },
      )
    }

    workerWindow.on('closed', () => {
      this.window = null
    })

    workerWindow.webContents.on('render-process-gone', () => {
      this.window = null
    })

    return workerWindow
  }
}

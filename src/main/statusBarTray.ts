import type { BrowserWindow, NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { app, Menu, nativeImage, Tray } from 'electron'

interface CreateStatusBarTrayOptions {
  getMainWindow: () => BrowserWindow | null
  createMainWindow: () => BrowserWindow
  setMainWindow: (window: BrowserWindow) => void
  onQuit: () => void
}

function resolveTrayIconPath(): string {
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, 'trayTemplate.png'),
        join(process.resourcesPath, 'icon.png'),
      ]
    : [
        join(process.cwd(), 'resources', 'trayTemplate.png'),
        join(process.cwd(), 'resources', 'icon.png'),
        join(process.cwd(), 'build', 'trayTemplate.png'),
        join(process.cwd(), 'build', 'icon.png'),
      ]

  for (const candidate of candidates) {
    if (existsSync(candidate))
      return candidate
  }

  return candidates[0]
}

function buildTrayImage(): NativeImage {
  const icon = nativeImage.createFromPath(resolveTrayIconPath())
  const resized = icon.resize({ width: 18, height: 18 })
  resized.setTemplateImage(true)
  return resized
}

export class StatusBarTray {
  private tray: Tray | null = null

  create(options: CreateStatusBarTrayOptions): void {
    if (process.platform !== 'darwin')
      return

    if (this.tray)
      return

    const ensureMainWindow = () => {
      const existing = options.getMainWindow()
      if (existing && !existing.isDestroyed())
        return existing

      const created = options.createMainWindow()
      options.setMainWindow(created)
      return created
    }

    const showMainWindow = () => {
      const window = ensureMainWindow()
      if (window.isMinimized())
        window.restore()
      window.show()
      window.focus()
      app.dock?.show()
    }

    const hideMainWindow = () => {
      const window = options.getMainWindow()
      if (!window || window.isDestroyed())
        return
      window.hide()
    }

    this.tray = new Tray(buildTrayImage())
    this.tray.setToolTip(app.name)
    this.tray.on('double-click', showMainWindow)

    const contextMenu = Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      { label: '隐藏主窗口', click: hideMainWindow },
      { type: 'separator' },
      { label: '退出', click: options.onQuit },
    ])

    this.tray.setContextMenu(contextMenu)
  }

  destroy(): void {
    if (!this.tray)
      return
    this.tray.destroy()
    this.tray = null
  }
}

import type { BrowserWindow } from 'electron'
import process from 'node:process'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { app } from 'electron'

interface RegisterAppLifecycleOptions {
  onReady: () => void | Promise<void>
  onBrowserWindowCreated?: (window: BrowserWindow) => void
  onActivate: () => void
  onBeforeQuit: () => void
}

export function registerAppLifecycle(options: RegisterAppLifecycleOptions): void {
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.electron')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
      options.onBrowserWindowCreated?.(window)
    })

    await options.onReady()

    app.on('activate', () => {
      options.onActivate()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    options.onBeforeQuit()
  })
}

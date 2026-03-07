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

// 请求单实例锁，防止应用多开
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('[app] Another instance is already running, quitting...')
  app.quit()
  process.exit(0)
}

export function registerAppLifecycle(
  options: RegisterAppLifecycleOptions,
): void {
  // 当尝试启动第二个实例时，激活第一个实例
  app.on('second-instance', () => {
    console.log('[app] Second instance detected, focusing existing window...')
    if (process.platform === 'darwin') {
      app.dock?.show()
    }
    options.onActivate()
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.electron')

    if (process.platform === 'darwin') {
      app.setActivationPolicy('regular')
      app.dock?.show()
    }

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

import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'

async function findMainWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    for (const window of app.windows()) {
      try {
        if (await window.getByRole('button', { name: /识别工作台/ }).count())
          return window
      }
      catch {
        // Keep polling until the main window is ready.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Main window not found within timeout')
}

// 验证测试钩子可模拟系统快捷键触发，并成功显示 HUD 窗口
test('test hook can simulate shortcut and show HUD window', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  try {
    const mainWindow = await findMainWindow(app)
    await mainWindow.waitForLoadState('domcontentloaded')

    const triggerResult = await mainWindow.evaluate(async () => {
      if (!window.api.test) {
        throw new Error('window.api.test is unavailable; NODE_ENV=test is required')
      }
      return window.api.test.triggerShortcutHub()
    })

    expect(triggerResult.ok).toBe(true)

    const hudVisibleDeadline = Date.now() + 10_000
    let hudVisible = false
    while (Date.now() < hudVisibleDeadline && !hudVisible) {
      hudVisible = await app.evaluate(async ({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows()
        return windows.some((window) => {
          const url = window.webContents.getURL()
          return url.includes('/voice-hud') && window.isVisible()
        })
      })
      if (!hudVisible) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    expect(hudVisible).toBe(true)
  }
  finally {
    await app.close()
  }
})

import { expect, test, triggerShortcutHub } from './fixtures'

// 验证测试钩子可模拟系统快捷键触发，并成功显示 HUD 窗口
test('test hook can simulate shortcut and show HUD window', async ({ app, mainWindow }) => {
  const triggerResult = await triggerShortcutHub(mainWindow)
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
})

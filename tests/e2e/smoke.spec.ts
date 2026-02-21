import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'

async function findMainWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    for (const window of app.windows()) {
      try {
        const workbenchButton = window.getByRole('button', { name: /识别工作台/ })
        if (await workbenchButton.count())
          return window
      }
      catch {
        // Keep polling until the main window is ready.
      }
    }

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error('Main window not found within timeout')
}

// 验证 Electron 应用可启动且主界面关键入口可见
test('electron app launches and renders main shell', async () => {
  const app = await electron.launch({
    args: ['.'],
  })

  try {
    const window = await findMainWindow(app)
    await window.waitForLoadState('domcontentloaded')

    await expect(window.getByRole('button', { name: /识别工作台/ })).toBeVisible()
    await expect(window.getByRole('button', { name: /首页/ })).toBeVisible()
  }
  finally {
    await app.close()
  }
})

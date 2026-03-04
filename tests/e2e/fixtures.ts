import type { Page } from '@playwright/test'
import process from 'node:process'
import { test as base, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'

export type ElectronApp = Awaited<ReturnType<typeof electron.launch>>

async function findMainWindow(app: ElectronApp): Promise<Page> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    for (const window of app.windows()) {
      try {
        const homeButton = window.getByRole('button', { name: /^首页$/ })
        const settingsButton = window.getByRole('button', { name: /^设置$/ })
        if ((await homeButton.count()) && (await settingsButton.count()))
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

export const test = base.extend<{
  app: ElectronApp
  mainWindow: Page
}>({
  app: async ({ playwright: _playwright }, use) => {
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })

    try {
      await use(app)
    }
    finally {
      await app.close()
    }
  },
  mainWindow: async ({ app }, use) => {
    const mainWindow = await findMainWindow(app)
    await mainWindow.waitForLoadState('domcontentloaded')
    await use(mainWindow)
  },
})

export async function triggerShortcutHub(mainWindow: Page): Promise<{ ok: true }> {
  return mainWindow.evaluate(async () => {
    if (!window.api.test) {
      throw new Error('window.api.test is unavailable; NODE_ENV=test is required')
    }
    return window.api.test.triggerShortcutHub()
  })
}

export async function pushHistoryEntry(mainWindow: Page, text: string): Promise<void> {
  await mainWindow.evaluate(async ({ text }) => {
    await window.api.history.clear()
    if (!window.api.test) {
      throw new Error('window.api.test is unavailable; NODE_ENV=test is required')
    }
    await window.api.test.pushHistoryEntry(text)
  }, { text })
}

export { expect }

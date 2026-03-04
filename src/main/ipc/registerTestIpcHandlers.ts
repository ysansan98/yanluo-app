import type { RegisterIpcHandlersOptions } from './types'
import { BrowserWindow as BW, ipcMain } from 'electron'
import { historyEntrySchema, okResponseSchema } from '~shared/ipc'

export function registerTestIpcHandlers(
  options: RegisterIpcHandlersOptions,
): void {
  const { historyStore, sessionOrchestrator } = options

  ipcMain.handle('test:shortcut:triggerHub', async () => {
    await sessionOrchestrator.handleHotkeyPress({
      skipPrerequisiteChecks: true,
      testUiOnly: true,
    })
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('test:history:push', async (_event, text: unknown) => {
    const message = String(text ?? '').trim()
    if (!message) {
      throw new Error('history text is required')
    }
    const entry = historyStore.create({
      source: 'live',
      entryType: 'asr_only',
      text: message,
      language: 'zh',
      elapsedMs: 1200,
      audioPath: null,
      triggeredAt: Date.now(),
    })
    BW.getAllWindows().forEach((win) => {
      win.webContents.send('history:created', entry)
    })
    return historyEntrySchema.parse(entry)
  })
}

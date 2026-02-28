import type { RegisterIpcHandlersOptions } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { BrowserWindow as BW, ipcMain } from 'electron'
import {
  historyCreateRequestSchema,
  historyEntrySchema,
  historyListRequestSchema,
  historyListResponseSchema,
  historyReadAudioRequestSchema,
  historyReadAudioResponseSchema,
  okResponseSchema,
} from '~shared/ipc'
import {
  buildHistoryReadAudioNotOk,
  buildHistoryReadAudioOk,
  getAudioMimeType,
} from './handlerServices'
import { parsePayload } from './utils'

export function registerHistoryIpcHandlers(
  options: RegisterIpcHandlersOptions,
): void {
  const { historyStore } = options

  ipcMain.handle('history:create', async (_event, payload: unknown) => {
    const validatedPayload = parsePayload(
      'history:create',
      payload,
      historyCreateRequestSchema,
    )
    const entry = historyStore.create(validatedPayload)
    BW.getAllWindows().forEach((win) => {
      win.webContents.send('history:created', entry)
    })
    return historyEntrySchema.parse(entry)
  })

  ipcMain.handle('history:list', async (_event, payload?: unknown) => {
    const validatedPayload = parsePayload(
      'history:list',
      payload,
      historyListRequestSchema,
    )
    return historyListResponseSchema.parse(
      historyStore.list(validatedPayload?.limit ?? 200),
    )
  })

  ipcMain.handle('history:clear', async () => {
    historyStore.clear()
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('history:readAudio', async (_event, payload: unknown) => {
    const validatedPayload = parsePayload(
      'history:readAudio',
      payload,
      historyReadAudioRequestSchema,
    )
    const rawPath = validatedPayload.path.trim()
    if (!rawPath) {
      return historyReadAudioResponseSchema.parse(
        buildHistoryReadAudioNotOk('empty path'),
      )
    }
    if (!existsSync(rawPath)) {
      return historyReadAudioResponseSchema.parse(
        buildHistoryReadAudioNotOk('file not found'),
      )
    }

    const mime = getAudioMimeType(rawPath)
    const data = readFileSync(rawPath)
    return historyReadAudioResponseSchema.parse(
      buildHistoryReadAudioOk(mime, data.toString('base64')),
    )
  })
}

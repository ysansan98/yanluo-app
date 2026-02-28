import type { RegisterIpcHandlersOptions } from './types'
import { ipcMain } from 'electron'
import {
  asrDownloadModelResponseSchema,
  asrHealthResponseSchema,
  asrModelInfoResponseSchema,
} from '~shared/ipc'
import { getModelDir, getModelId, modelExists } from '../modelManager'

export function registerAsrIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { asrService, getMainWindow, modelDownloader } = options

  ipcMain.handle('asr:health', async () =>
    asrHealthResponseSchema.parse(await asrService.health()))

  ipcMain.handle('asr:modelInfo', async () =>
    asrModelInfoResponseSchema.parse({
      modelId: getModelId(),
      modelDir: getModelDir(),
      exists: modelExists(),
    }))

  ipcMain.handle('asr:downloadModel', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      throw new Error('Window not ready')
    }
    if (modelExists()) {
      return asrDownloadModelResponseSchema.parse({ status: 'exists' as const })
    }
    if (modelDownloader.running) {
      return asrDownloadModelResponseSchema.parse({ status: 'running' as const })
    }
    await modelDownloader.start(mainWindow)
    return asrDownloadModelResponseSchema.parse({ status: 'ok' as const })
  })
}

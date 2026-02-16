import type { BrowserWindow } from 'electron'
import type { AsrService } from './asrService'
import type { ModelDownloader } from './modelManager'
import type { SessionOrchestrator } from './voice/types'
import { dialog, ipcMain } from 'electron'
import { getModelDir, getModelId, modelExists } from './modelManager'

interface RegisterIpcHandlersOptions {
  asrService: AsrService
  modelDownloader: ModelDownloader
  sessionOrchestrator: SessionOrchestrator
  getMainWindow: () => BrowserWindow | null
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { asrService, getMainWindow, modelDownloader, sessionOrchestrator } = options

  ipcMain.on('ping', () => console.warn('pong'))
  ipcMain.handle('asr:health', async () => asrService.health())
  ipcMain.handle('asr:transcribeFile', async (_event, path: string, language?: string) => {
    const res = await asrService.transcribeFile(path, language)
    console.warn('[asr:transcribeFile] response', {
      language: res.language,
      textLength: res.text?.length ?? 0,
      elapsedMs: res.elapsed_ms,
    })
    return res
  })
  ipcMain.handle('asr:modelInfo', async () => ({
    modelId: getModelId(),
    modelDir: getModelDir(),
    exists: modelExists(),
  }))
  ipcMain.handle('asr:downloadModel', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow)
      throw new Error('Window not ready')
    if (modelExists())
      return { status: 'exists' as const }
    if (modelDownloader.running)
      return { status: 'running' as const }
    await modelDownloader.start(mainWindow)
    return { status: 'ok' as const }
  })
  ipcMain.handle('asr:pickAudioFile', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow)
      throw new Error('Window not ready')
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select audio file',
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'aac', 'webm'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0)
      return null
    return result.filePaths[0]
  })
  ipcMain.handle('voice:recording:start', async () => {
    await sessionOrchestrator.handleHotkeyPress()
    return { ok: true as const }
  })
  ipcMain.handle('voice:recording:stop', async () => {
    await sessionOrchestrator.handleHotkeyRelease()
    return { ok: true as const }
  })
  ipcMain.handle('voice:getConfig', async () => ({
    continueWindowMs: sessionOrchestrator.getContinueWindowMs?.() ?? 2000,
  }))
  ipcMain.handle('voice:setConfig', async (_event, payload: { continueWindowMs?: number }) => {
    if (typeof payload?.continueWindowMs === 'number') {
      sessionOrchestrator.setContinueWindowMs?.(payload.continueWindowMs)
    }
    return {
      ok: true as const,
      continueWindowMs: sessionOrchestrator.getContinueWindowMs?.() ?? 2000,
    }
  })
}

import type { BrowserWindow } from 'electron'
import type { VadConfig } from '~shared/voice'
import type { AsrService } from './asrService'
import type { HistoryStore } from './historyStore'
import type { ModelDownloader } from './modelManager'
import type { SettingsStore } from './settingsStore'
import type { SessionOrchestrator } from './voice/types'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { VAD_CONFIG_IPC } from '~shared/voice'
import { getModelDir, getModelId, modelExists } from './modelManager'

interface RegisterIpcHandlersOptions {
  asrService: AsrService
  historyStore: HistoryStore
  modelDownloader: ModelDownloader
  sessionOrchestrator: SessionOrchestrator
  settingsStore: SettingsStore
  getMainWindow: () => BrowserWindow | null
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { asrService, getMainWindow, historyStore, modelDownloader, sessionOrchestrator, settingsStore } = options

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
    continueWindowMs: settingsStore.get().voice.continueWindowMs,
  }))
  ipcMain.handle('voice:setConfig', async (_event, payload: { continueWindowMs?: number }) => {
    if (typeof payload?.continueWindowMs === 'number') {
      const updated = settingsStore.updateVoiceSettings({ continueWindowMs: payload.continueWindowMs })
      sessionOrchestrator.setContinueWindowMs?.(updated.voice.continueWindowMs)
    }
    else {
      sessionOrchestrator.setContinueWindowMs?.(settingsStore.get().voice.continueWindowMs)
    }
    return {
      ok: true as const,
      continueWindowMs: settingsStore.get().voice.continueWindowMs,
    }
  })
  ipcMain.handle(VAD_CONFIG_IPC.GET, async () => ({
    ...settingsStore.get().voice.vad,
  }))
  ipcMain.handle(VAD_CONFIG_IPC.SET, async (_event, payload: Partial<VadConfig>) => {
    const updated = settingsStore.updateVadSettings(payload)
    // Notify all renderer windows of config update
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send(VAD_CONFIG_IPC.UPDATED, updated.voice.vad)
    }
    return {
      ok: true as const,
      ...updated.voice.vad,
    }
  })
  ipcMain.handle('history:create', async (_event, payload: {
    source: 'file' | 'live'
    entryType: 'asr_only' | 'polish'
    commandName?: string | null
    text: string
    language?: string
    elapsedMs?: number
    audioPath?: string | null
    triggeredAt?: number
  }) => historyStore.create(payload))
  ipcMain.handle('history:list', async (_event, payload?: { limit?: number }) =>
    historyStore.list(payload?.limit ?? 200))
  ipcMain.handle('history:clear', async () => {
    historyStore.clear()
    return { ok: true as const }
  })
  ipcMain.handle('history:readAudio', async (_event, payload: { path: string }) => {
    const rawPath = payload?.path?.trim()
    if (!rawPath)
      return { ok: false as const, message: 'empty path' }
    if (!existsSync(rawPath))
      return { ok: false as const, message: 'file not found' }

    const ext = extname(rawPath).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
    }
    const mime = mimeMap[ext] ?? 'application/octet-stream'
    const data = readFileSync(rawPath)
    return {
      ok: true as const,
      mime,
      base64: data.toString('base64'),
    }
  })
}

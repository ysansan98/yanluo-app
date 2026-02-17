import type { ElectronAPI } from '@electron-toolkit/preload'
import type { VoiceBridgeApi } from './voiceBridge'

interface AsrApi {
  health: () => Promise<{ status: string, model_loaded: boolean, model_error?: string | null }>
  modelInfo: () => Promise<{ modelId: string, modelDir: string, exists: boolean }>
  downloadModel: () => Promise<{ status: 'ok' | 'exists' | 'running' }>
  onDownloadLog: (handler: (payload: { type: string, message: string }) => void) => () => void
  transcribeFile: (
    path: string,
    language?: string,
  ) => Promise<{ text: string, language: string, elapsed_ms?: number }>
  pickAudioFile: () => Promise<string | null>
}

interface HistoryApi {
  create: (payload: {
    source: 'file' | 'live'
    entryType: 'asr_only' | 'polish'
    commandName?: string | null
    text: string
    language?: string
    elapsedMs?: number
    audioPath?: string | null
    triggeredAt?: number
  }) => Promise<{
    id: string
    source: 'file' | 'live'
    entryType: 'asr_only' | 'polish'
    commandName: string | null
    text: string
    textLength: number
    language: string
    elapsedMs: number
    audioPath: string | null
    triggeredAt: number
    createdAt: number
  }>
  list: (payload?: { limit?: number }) => Promise<Array<{
    id: string
    source: 'file' | 'live'
    entryType: 'asr_only' | 'polish'
    commandName: string | null
    text: string
    textLength: number
    language: string
    elapsedMs: number
    audioPath: string | null
    triggeredAt: number
    createdAt: number
  }>>
  clear: () => Promise<{ ok: true }>
  readAudio: (payload: { path: string }) => Promise<
    | { ok: true, mime: string, base64: string }
    | { ok: false, message: string }
  >
}

interface AppApi {
  asr: AsrApi
  history: HistoryApi
  voice: VoiceBridgeApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}

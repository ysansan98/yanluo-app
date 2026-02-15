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

interface AppApi {
  asr: AsrApi
  voice: VoiceBridgeApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}

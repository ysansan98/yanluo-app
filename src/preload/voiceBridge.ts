import type {
  VadConfig,
  VoiceUiFinalPayload,
  VoiceUiShowPayload,
  VoiceUiToastPayload,
  VoiceUiUpdatePayload,
} from '~shared/voice'
import { ipcRenderer } from 'electron'
import { AUDIO_IPC, VAD_CONFIG_IPC, VOICE_IPC } from '~shared/voice'

export interface VoiceBridgeApi {
  onShow: (cb: (payload: VoiceUiShowPayload) => void) => () => void
  onUpdate: (cb: (payload: VoiceUiUpdatePayload) => void) => () => void
  onFinal: (cb: (payload: VoiceUiFinalPayload) => void) => () => void
  onHide: (cb: () => void) => () => void
  onToast: (cb: (payload: VoiceUiToastPayload) => void) => () => void
  onAudioStart: (cb: () => void) => () => void
  onAudioStop: (cb: () => void) => () => void
  sendAudioChunk: (payload: {
    pcm16leBase64: string
    sampleRate: number
    channels: number
    timestampMs: number
  }) => void
  sendAudioState: (payload: {
    state: 'started' | 'stopped' | 'running'
    timestampMs: number
    phase?: string
    rms?: number
    maxAbs?: number
    nonZeroRatio?: number
    audioContextState?: string
    inputDeviceLabel?: string
  }) => void
  sendAudioError: (payload: { message: string }) => void
  requestSilentCancel: () => void
  startRecording: () => Promise<{ ok: true }>
  stopRecording: () => Promise<{ ok: true }>
  getConfig: () => Promise<{ continueWindowMs: number }>
  setConfig: (payload: {
    continueWindowMs?: number
  }) => Promise<{ ok: true, continueWindowMs: number }>
  getVadConfig: () => Promise<VadConfig>
  setVadConfig: (
    payload: Partial<VadConfig>,
  ) => Promise<{ ok: true } & VadConfig>
  onVadConfigUpdated: (cb: (config: VadConfig) => void) => () => void
}

function bindEvent<T>(
  channel: string,
  handler: (payload: T) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) =>
    handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export function createVoiceBridge(): VoiceBridgeApi {
  return {
    onShow: cb => bindEvent(VOICE_IPC.UI_SHOW, cb),
    onUpdate: cb => bindEvent(VOICE_IPC.UI_UPDATE, cb),
    onFinal: cb => bindEvent(VOICE_IPC.UI_FINAL, cb),
    onHide: (cb) => {
      const listener = () => cb()
      ipcRenderer.on(VOICE_IPC.UI_HIDE, listener)
      return () => ipcRenderer.removeListener(VOICE_IPC.UI_HIDE, listener)
    },
    onToast: cb => bindEvent(VOICE_IPC.UI_TOAST, cb),
    onAudioStart: (cb) => {
      const listener = () => cb()
      ipcRenderer.on(AUDIO_IPC.START, listener)
      return () => ipcRenderer.removeListener(AUDIO_IPC.START, listener)
    },
    onAudioStop: (cb) => {
      const listener = () => cb()
      ipcRenderer.on(AUDIO_IPC.STOP, listener)
      return () => ipcRenderer.removeListener(AUDIO_IPC.STOP, listener)
    },
    sendAudioChunk: payload => ipcRenderer.send(AUDIO_IPC.CHUNK, payload),
    sendAudioState: payload => ipcRenderer.send(AUDIO_IPC.STATE, payload),
    sendAudioError: payload => ipcRenderer.send(AUDIO_IPC.ERROR, payload),
    requestSilentCancel: () => ipcRenderer.send(AUDIO_IPC.VAD_SILENT_CANCEL),
    startRecording: () => ipcRenderer.invoke('voice:recording:start'),
    stopRecording: () => ipcRenderer.invoke('voice:recording:stop'),
    getConfig: () => ipcRenderer.invoke('voice:getConfig'),
    setConfig: payload => ipcRenderer.invoke('voice:setConfig', payload),
    getVadConfig: () => ipcRenderer.invoke(VAD_CONFIG_IPC.GET),
    setVadConfig: payload => ipcRenderer.invoke(VAD_CONFIG_IPC.SET, payload),
    onVadConfigUpdated: cb => bindEvent(VAD_CONFIG_IPC.UPDATED, cb),
  }
}

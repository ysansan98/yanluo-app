import type {
  VoiceUiFinalPayload,
  VoiceUiShowPayload,
  VoiceUiToastPayload,
  VoiceUiUpdatePayload,
} from '../main/voice/types'
import { ipcRenderer } from 'electron'
import { VOICE_IPC } from '../main/voice/ipcChannels'

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
  startRecording: () => Promise<{ ok: true }>
  stopRecording: () => Promise<{ ok: true }>
}

function bindEvent<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => handler(payload)
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
      ipcRenderer.on('voice:audio:start', listener)
      return () => ipcRenderer.removeListener('voice:audio:start', listener)
    },
    onAudioStop: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('voice:audio:stop', listener)
      return () => ipcRenderer.removeListener('voice:audio:stop', listener)
    },
    sendAudioChunk: payload => ipcRenderer.send('voice:audio:chunk', payload),
    sendAudioState: payload => ipcRenderer.send('voice:audio:state', payload),
    sendAudioError: payload => ipcRenderer.send('voice:audio:error', payload),
    startRecording: () => ipcRenderer.invoke('voice:recording:start'),
    stopRecording: () => ipcRenderer.invoke('voice:recording:stop'),
  }
}

import process from 'node:process'
import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
import { createVoiceBridge } from './voiceBridge'

// Custom APIs for renderer
const api = {
  asr: {
    health: () => ipcRenderer.invoke('asr:health'),
    modelInfo: () => ipcRenderer.invoke('asr:modelInfo'),
    downloadModel: () => ipcRenderer.invoke('asr:downloadModel'),
    onDownloadLog: (handler: (payload: { type: string, message: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { type: string, message: string }) =>
        handler(payload)
      ipcRenderer.on('asr:downloadLog', listener)
      return () => ipcRenderer.removeListener('asr:downloadLog', listener)
    },
    transcribeFile: (path: string, language?: string) =>
      ipcRenderer.invoke('asr:transcribeFile', path, language),
    pickAudioFile: () => ipcRenderer.invoke('asr:pickAudioFile'),
  },
  history: {
    create: (payload: {
      source: 'file' | 'live'
      entryType: 'asr_only' | 'polish'
      commandName?: string | null
      text: string
      language?: string
      elapsedMs?: number
      audioPath?: string | null
      triggeredAt?: number
    }) => ipcRenderer.invoke('history:create', payload),
    list: (payload?: { limit?: number }) => ipcRenderer.invoke('history:list', payload),
    clear: () => ipcRenderer.invoke('history:clear'),
    readAudio: (payload: { path: string }) => ipcRenderer.invoke('history:readAudio', payload),
  },
  voice: createVoiceBridge(),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  }
  catch (error) {
    console.error(error)
  }
}
else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}

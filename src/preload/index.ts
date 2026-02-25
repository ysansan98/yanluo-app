import type { DownloadProgress } from '../main/modelManager'
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
    // 订阅下载进度（返回取消订阅函数）
    onDownloadProgress: (handler: (progress: DownloadProgress) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: DownloadProgress,
      ) => handler(progress)
      ipcRenderer.on('asr:downloadProgress', listener)
      return () => ipcRenderer.removeListener('asr:downloadProgress', listener)
    },
    // 订阅下载日志
    onDownloadLog: (
      handler: (payload: { type: string, message: string }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { type: string, message: string },
      ) => handler(payload)
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
    list: (payload?: { limit?: number }) =>
      ipcRenderer.invoke('history:list', payload),
    clear: () => ipcRenderer.invoke('history:clear'),
    readAudio: (payload: { path: string }) =>
      ipcRenderer.invoke('history:readAudio', payload),
  },
  voice: createVoiceBridge(),
  // 引导相关 API
  onboarding: {
    getStatus: () => ipcRenderer.invoke('onboarding:getStatus'),
    complete: () => ipcRenderer.invoke('onboarding:complete'),
    skipStep: (stepId: string) =>
      ipcRenderer.invoke('onboarding:skipStep', stepId),
    reset: () => ipcRenderer.invoke('onboarding:reset'),
  },
  // 权限相关 API
  permission: {
    check: (kind: 'MICROPHONE' | 'ACCESSIBILITY') =>
      ipcRenderer.invoke('permission:check', kind),
    request: (kind: 'MICROPHONE' | 'ACCESSIBILITY') =>
      ipcRenderer.invoke('permission:request', kind),
  },
  // 快捷键相关 API
  shortcut: {
    get: () => ipcRenderer.invoke('shortcut:get'),
    set: (shortcut: string | null) =>
      ipcRenderer.invoke('shortcut:set', shortcut),
    disableGlobal: () => {
      console.log('[preload] Requesting to disable hotkeys globally')
      ipcRenderer.invoke('shortcut:disableGlobal')
    },
    enableGlobal: () => ipcRenderer.invoke('shortcut:enableGlobal'),
    initHotkey: () => ipcRenderer.invoke('shortcut:initHotkey'),
  },
  // 剪贴板相关 API
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  },
  // 应用级事件
  app: {
    onShowOnboarding: (handler: () => void) => {
      const listener = () => handler()
      ipcRenderer.on('app:showOnboarding', listener)
      return () => ipcRenderer.removeListener('app:showOnboarding', listener)
    },
    onModelRequired: (handler: () => void) => {
      const listener = () => handler()
      ipcRenderer.on('app:modelRequired', listener)
      return () => ipcRenderer.removeListener('app:modelRequired', listener)
    },
    onShortcutRequired: (handler: () => void) => {
      const listener = () => handler()
      ipcRenderer.on('app:shortcutRequired', listener)
      return () => ipcRenderer.removeListener('app:shortcutRequired', listener)
    },
  },
  ...(process.env.NODE_ENV === 'test'
    ? {
        test: {
          triggerShortcutHub: () => ipcRenderer.invoke('test:shortcut:triggerHub'),
        },
      }
    : {}),
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

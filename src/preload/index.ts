import type {
  AiSetProviderConfigRequest,
  AsrDownloadLogEvent,
  AsrDownloadModelResponse,
  AsrDownloadProgress,
  AsrHealthResponse,
  AsrModelInfoResponse,
  HistoryCreateRequest,
  HistoryEntry,
  HistoryListRequest,
  HistoryListResponse,
  HistoryReadAudioRequest,
  PolishAddCommandRequest,
  PolishUpdateSettingsRequest,
} from '~shared/ipc'
import process from 'node:process'
import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
import {
  aiCheckConfiguredResponseSchema,
  aiGetConfigResponseSchema,
  aiRegistryResponseSchema,
  aiSetActiveProviderRequestSchema,
  aiSetProviderConfigRequestSchema,
  aiValidateProviderResponseSchema,
  asrDownloadLogEventSchema,
  asrDownloadModelResponseSchema,
  asrDownloadProgressSchema,
  asrHealthResponseSchema,
  asrModelInfoResponseSchema,
  clipboardWriteTextRequestSchema,
  clipboardWriteTextResponseSchema,
  historyCreateRequestSchema,
  historyEntrySchema,
  historyListRequestSchema,
  historyListResponseSchema,
  historyReadAudioRequestSchema,
  historyReadAudioResponseSchema,
  okResponseSchema,
  onboardingSkipStepRequestSchema,
  onboardingStatusResponseSchema,
  permissionKindSchema,
  permissionStatusSchema,
  polishAddCommandRequestSchema,
  polishCommandsResponseSchema,
  polishConfigResponseSchema,
  polishRemoveCommandRequestSchema,
  polishSetCommandRequestSchema,
  polishSetEnabledRequestSchema,
  polishUpdateSettingsRequestSchema,
  providerKeySchema,
  shortcutGetResponseSchema,
  shortcutSetRequestSchema,
  shortcutSetResponseSchema,
} from '~shared/ipc'
import { createVoiceBridge } from './voiceBridge'

// Custom APIs for renderer
const api = {
  asr: {
    health: async (): Promise<AsrHealthResponse> =>
      asrHealthResponseSchema.parse(await ipcRenderer.invoke('asr:health')),
    modelInfo: async (): Promise<AsrModelInfoResponse> =>
      asrModelInfoResponseSchema.parse(await ipcRenderer.invoke('asr:modelInfo')),
    downloadModel: async (): Promise<AsrDownloadModelResponse> =>
      asrDownloadModelResponseSchema.parse(
        await ipcRenderer.invoke('asr:downloadModel'),
      ),
    // 订阅下载进度（返回取消订阅函数）
    onDownloadProgress: (handler: (progress: AsrDownloadProgress) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: AsrDownloadProgress,
      ) => handler(asrDownloadProgressSchema.parse(progress))
      ipcRenderer.on('asr:downloadProgress', listener)
      return () => ipcRenderer.removeListener('asr:downloadProgress', listener)
    },
    // 订阅下载日志
    onDownloadLog: (
      handler: (payload: AsrDownloadLogEvent) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { type: string, message: string },
      ) => handler(asrDownloadLogEventSchema.parse(payload))
      ipcRenderer.on('asr:downloadLog', listener)
      return () => ipcRenderer.removeListener('asr:downloadLog', listener)
    },
  },
  history: {
    create: async (payload: HistoryCreateRequest): Promise<HistoryEntry> =>
      historyEntrySchema.parse(
        await ipcRenderer.invoke(
          'history:create',
          historyCreateRequestSchema.parse(payload),
        ),
      ),
    list: async (payload?: HistoryListRequest): Promise<HistoryListResponse> =>
      historyListResponseSchema.parse(
        await ipcRenderer.invoke('history:list', historyListRequestSchema.parse(payload)),
      ),
    clear: async () =>
      okResponseSchema.parse(await ipcRenderer.invoke('history:clear')),
    readAudio: async (payload: HistoryReadAudioRequest) =>
      historyReadAudioResponseSchema.parse(
        await ipcRenderer.invoke(
          'history:readAudio',
          historyReadAudioRequestSchema.parse(payload),
        ),
      ),
    onCreated: (listener: (entry: HistoryEntry) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, entry: HistoryEntry) =>
        listener(historyEntrySchema.parse(entry))
      ipcRenderer.on('history:created', wrappedListener)
      return () => ipcRenderer.removeListener('history:created', wrappedListener)
    },
  },
  voice: createVoiceBridge(),
  // 引导相关 API
  onboarding: {
    getStatus: async () =>
      onboardingStatusResponseSchema.parse(
        await ipcRenderer.invoke('onboarding:getStatus'),
      ),
    complete: async () =>
      okResponseSchema.parse(await ipcRenderer.invoke('onboarding:complete')),
    skipStep: (stepId: string) =>
      ipcRenderer.invoke(
        'onboarding:skipStep',
        onboardingSkipStepRequestSchema.parse(stepId),
      ),
    reset: async () => okResponseSchema.parse(await ipcRenderer.invoke('onboarding:reset')),
  },
  // 权限相关 API
  permission: {
    check: async (kind: 'MICROPHONE' | 'ACCESSIBILITY') =>
      permissionStatusSchema.parse(
        await ipcRenderer.invoke('permission:check', permissionKindSchema.parse(kind)),
      ),
    request: async (kind: 'MICROPHONE' | 'ACCESSIBILITY') =>
      permissionStatusSchema.parse(
        await ipcRenderer.invoke(
          'permission:request',
          permissionKindSchema.parse(kind),
        ),
      ),
  },
  // 快捷键相关 API
  shortcut: {
    get: async () =>
      shortcutGetResponseSchema.parse(await ipcRenderer.invoke('shortcut:get')),
    set: async (shortcut: string | null) =>
      shortcutSetResponseSchema.parse(
        await ipcRenderer.invoke(
          'shortcut:set',
          shortcutSetRequestSchema.parse(shortcut),
        ),
      ),
    disableGlobal: async () => {
      console.log('[preload] Requesting to disable hotkeys globally')
      return okResponseSchema.parse(
        await ipcRenderer.invoke('shortcut:disableGlobal'),
      )
    },
    enableGlobal: async () =>
      okResponseSchema.parse(await ipcRenderer.invoke('shortcut:enableGlobal')),
    initHotkey: async () =>
      okResponseSchema.parse(await ipcRenderer.invoke('shortcut:initHotkey')),
  },
  // 剪贴板相关 API
  clipboard: {
    writeText: async (text: string) =>
      clipboardWriteTextResponseSchema.parse(
        await ipcRenderer.invoke(
          'clipboard:writeText',
          clipboardWriteTextRequestSchema.parse(text),
        ),
      ),
  },
  // AI Provider API
  ai: {
    getRegistry: async () =>
      aiRegistryResponseSchema.parse(await ipcRenderer.invoke('ai:getRegistry')),
    getConfig: async () =>
      aiGetConfigResponseSchema.parse(await ipcRenderer.invoke('ai:getConfig')),
    setProviderConfig: async (providerId: string, config: AiSetProviderConfigRequest) =>
      okResponseSchema.parse(
        await ipcRenderer.invoke(
          'ai:setProviderConfig',
          providerKeySchema.parse(providerId),
          aiSetProviderConfigRequestSchema.parse(config),
        ),
      ),
    removeProviderConfig: async (providerId: string) =>
      okResponseSchema.parse(
        await ipcRenderer.invoke(
          'ai:removeProviderConfig',
          providerKeySchema.parse(providerId),
        ),
      ),
    setActiveProvider: async (providerId: string | null, modelId: string | null) => {
      const validated = aiSetActiveProviderRequestSchema.parse({
        providerId,
        modelId,
      })
      return okResponseSchema.parse(
        await ipcRenderer.invoke(
          'ai:setActiveProvider',
          validated.providerId,
          validated.modelId,
        ),
      )
    },
    checkConfigured: async () =>
      aiCheckConfiguredResponseSchema.parse(
        await ipcRenderer.invoke('ai:checkConfigured'),
      ),
    validateProvider: async (providerId: string, modelId: string) =>
      aiValidateProviderResponseSchema.parse(
        await ipcRenderer.invoke(
          'ai:validateProvider',
          providerKeySchema.parse(providerId),
          modelId,
        ),
      ),
  },
  // Polish API
  polish: {
    getConfig: async () =>
      polishConfigResponseSchema.parse(await ipcRenderer.invoke('polish:getConfig')),
    setEnabled: async (enabled: boolean) =>
      okResponseSchema.parse(
        await ipcRenderer.invoke(
          'polish:setEnabled',
          polishSetEnabledRequestSchema.parse(enabled),
        ),
      ),
    setCommand: async (commandId: string | null) =>
      okResponseSchema.parse(
        await ipcRenderer.invoke(
          'polish:setCommand',
          polishSetCommandRequestSchema.parse(commandId),
        ),
      ),
    getCommands: async () =>
      polishCommandsResponseSchema.parse(await ipcRenderer.invoke('polish:getCommands')),
    updateSettings: async (payload: PolishUpdateSettingsRequest) =>
      okResponseSchema.parse(
        await ipcRenderer.invoke(
          'polish:updateSettings',
          polishUpdateSettingsRequestSchema.parse(payload),
        ),
      ),
    addCommand: async (command: PolishAddCommandRequest) =>
      okResponseSchema.parse(
        await ipcRenderer.invoke(
          'polish:addCommand',
          polishAddCommandRequestSchema.parse(command),
        ),
      ),
    removeCommand: async (commandId: string) =>
      okResponseSchema.parse(
        await ipcRenderer.invoke(
          'polish:removeCommand',
          polishRemoveCommandRequestSchema.parse(commandId),
        ),
      ),
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
          triggerShortcutHub: async () =>
            okResponseSchema.parse(
              await ipcRenderer.invoke('test:shortcut:triggerHub'),
            ),
          pushHistoryEntry: async (text: string) =>
            historyEntrySchema.parse(
              await ipcRenderer.invoke('test:history:push', text),
            ),
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

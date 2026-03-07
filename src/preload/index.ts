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
  LogLevel,
  LogsExportResponse,
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
  logsExportRequestSchema,
  logsExportResponseSchema,
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
  rendererLogRequestSchema,
  shortcutGetResponseSchema,
  shortcutSetRequestSchema,
  shortcutSetResponseSchema,
} from '~shared/ipc'
import { createVoiceBridge } from './voiceBridge'

// Custom APIs for renderer
async function sendRendererLog(
  level: LogLevel,
  scope: string,
  message: string,
  extra?: unknown,
): Promise<void> {
  const normalizedExtra = normalizeLogExtra(extra)
  await ipcRenderer.invoke(
    'log:renderer',
    rendererLogRequestSchema.parse({
      level,
      scope,
      message,
      extra: normalizedExtra,
    }),
  )
}

function normalizeLogExtra(extra: unknown): Record<string, unknown> | undefined {
  const baseMeta: Record<string, unknown> = {
    processType: 'renderer',
    page: {
      href: window.location.href,
      hash: window.location.hash,
      pathname: window.location.pathname,
    },
  }

  if (extra === undefined) {
    return baseMeta
  }
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    return {
      ...baseMeta,
      ...(extra as Record<string, unknown>),
    }
  }
  return {
    ...baseMeta,
    value: extra,
  }
}

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
      await sendRendererLog('debug', 'preload-shortcut', 'request disable global hotkey')
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
  diagnostics: {
    exportRecentLogs: async (minutes: number = 30): Promise<LogsExportResponse> =>
      logsExportResponseSchema.parse(
        await ipcRenderer.invoke(
          'logs:exportRecent',
          logsExportRequestSchema.parse({ minutes }),
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
  log: {
    debug: (scope: string, message: string, extra?: unknown) =>
      sendRendererLog('debug', scope, message, extra),
    info: (scope: string, message: string, extra?: unknown) =>
      sendRendererLog('info', scope, message, extra),
    warn: (scope: string, message: string, extra?: unknown) =>
      sendRendererLog('warn', scope, message, extra),
    error: (scope: string, message: string, extra?: unknown) =>
      sendRendererLog('error', scope, message, extra),
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
    void sendRendererLog('error', 'preload-bootstrap', 'failed to expose preload APIs', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}

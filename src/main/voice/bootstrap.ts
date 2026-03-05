import type { WebContents } from 'electron'
import type { SettingsStore } from '../settingsStore'
import type {
  HotkeyManager,
  PermissionChecker,
  SessionOrchestrator,
  VoiceUiFinalPayload,
  VoiceUiShowPayload,
  VoiceUiToastPayload,
  VoiceUiUpdatePayload,
} from './types'
import { join } from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import { createHotkeyManager } from '../keyboard'
import { RendererAudioCapture } from './audioCapture'
import {
  isHotkeyDisabledGlobally,
  setHotkeyDisabledGlobally,
} from './hotkeyState'
import { MacPermissionChecker } from './permissionChecker'
import { DefaultSessionOrchestrator } from './sessionOrchestrator'
import { WsStreamingAsrClient } from './streamingAsrClient'
import { MacTextInjector } from './textInjector'

export { setHotkeyDisabledGlobally }

interface CreateVoiceRuntimeOptions {
  asrBaseUrl: string
  getTargetWebContents: () => WebContents | null
  getMainWindow: () => import('electron').BrowserWindow | null
  settingsStore: SettingsStore
  onUiShow: (payload: VoiceUiShowPayload) => void
  onUiUpdate: (payload: VoiceUiUpdatePayload) => void
  onUiFinal: (payload: VoiceUiFinalPayload) => void
  onUiHide: () => void
  onUiToast: (payload: VoiceUiToastPayload) => void
}

interface VoiceRuntime {
  hotkeyManager: HotkeyManager
  sessionOrchestrator: SessionOrchestrator
  permissionChecker: PermissionChecker
  /**
   * 延迟初始化热键（在引导完成后调用，避免启动时立即请求辅助功能权限）
   */
  initHotkey: () => Promise<void>
}

export function createVoiceRuntime(
  options: CreateVoiceRuntimeOptions,
): VoiceRuntime {
  // 从设置中读取快捷键配置
  const savedShortcut = options.settingsStore.getShortcut()

  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : join(app.getAppPath(), 'resources')

  const hotkeyManager = createHotkeyManager({
    resourcesPath,
    shortcut: savedShortcut ?? undefined,
    log: (message, extra) => {
      console.info(`[voice-hotkey] ${message}`, extra ?? {})
    },
    // 在事件源头检查是否应该处理（用于 onboarding 设置快捷键时临时禁用）
    shouldProcess: () => {
      return !isHotkeyDisabledGlobally()
    },
  })
  const audioCapture = new RendererAudioCapture({
    getTargetWebContents: options.getTargetWebContents,
    log: (message, extra) => {
      console.info(`[voice-audio] ${message}`, extra ?? {})
    },
  })
  const asrClient = new WsStreamingAsrClient({
    wsUrl: options.asrBaseUrl.replace('http://', 'ws://').concat('/asr/stream'),
    log: (message, extra) => {
      console.info(`[voice-asr] ${message}`, extra ?? {})
    },
  })
  const permissionChecker = new MacPermissionChecker()
  const textInjector = new MacTextInjector()
  const sessionOrchestrator = new DefaultSessionOrchestrator({
    hotkeyManager,
    audioCapture,
    asrClient,
    textInjector,
    permissionChecker,
    settingsStore: options.settingsStore,
    getMainWindow: options.getMainWindow,
    enableHotkey: true,
    onUiShow: options.onUiShow,
    onUiUpdate: options.onUiUpdate,
    onUiFinal: options.onUiFinal,
    onUiHide: options.onUiHide,
    onUiToast: options.onUiToast,
    log: (message, extra) => {
      console.info(`[voice-session] ${message}`, extra ?? {})
    },
  })

  // 注意：热键事件已在 SessionOrchestrator.bindEvents() 中绑定
  // 这里不需要重复绑定，避免绕过 shouldProcess 检查

  return {
    hotkeyManager,
    sessionOrchestrator,
    permissionChecker,
    /**
     * 延迟初始化热键（在引导完成后调用，避免启动时立即请求辅助功能权限）
     */
    initHotkey: async () => {
      await sessionOrchestrator.initHotkey?.()
    },
  }
}

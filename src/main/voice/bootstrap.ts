import type { WebContents } from 'electron'
import type {
  HotkeyManager,
  SessionOrchestrator,
  VoiceUiFinalPayload,
  VoiceUiShowPayload,
  VoiceUiToastPayload,
  VoiceUiUpdatePayload,
} from './types'
import { RendererAudioCapture } from './audioCapture'
import { MacGlobalHotkeyManager } from './hotkeyManager'
import { MacPermissionChecker } from './permissionChecker'
import { DefaultSessionOrchestrator } from './sessionOrchestrator'
import { WsStreamingAsrClient } from './streamingAsrClient'
import { MacTextInjector } from './textInjector'

interface CreateVoiceRuntimeOptions {
  asrBaseUrl: string
  getTargetWebContents: () => WebContents | null
  onUiShow: (payload: VoiceUiShowPayload) => void
  onUiUpdate: (payload: VoiceUiUpdatePayload) => void
  onUiFinal: (payload: VoiceUiFinalPayload) => void
  onUiHide: () => void
  onUiToast: (payload: VoiceUiToastPayload) => void
}

interface VoiceRuntime {
  hotkeyManager: HotkeyManager
  sessionOrchestrator: SessionOrchestrator
}

export function createVoiceRuntime(options: CreateVoiceRuntimeOptions): VoiceRuntime {
  const hotkeyManager = new MacGlobalHotkeyManager({
    log: (message, extra) => {
      console.info(`[voice-hotkey] ${message}`, extra ?? {})
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

  return {
    hotkeyManager,
    sessionOrchestrator,
  }
}

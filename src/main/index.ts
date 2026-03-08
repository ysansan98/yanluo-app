import type { BrowserWindow } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow as BW } from 'electron'
import { app } from 'electron'
import { VOICE_IPC } from '~shared/voice'
import { registerAppLifecycle } from './appLifecycle'
import { AsrService } from './asrService'
import { createMainAppHandlers } from './bootstrapMainApp'
import { HistoryStore } from './historyStore'
import { ModelDownloader } from './modelManager'
import { SettingsStore } from './settingsStore'
import { createVoiceRuntime } from './voice'
import { VoiceHudManager } from './voiceHud/voiceHudManager'
import { createMainWindow } from './windows/mainWindow'
import { VoiceWorkerWindowController } from './windows/voiceWorkerWindow'

if (process.env.NODE_ENV === 'test') {
  const isolatedUserDataDir = mkdtempSync(join(tmpdir(), 'yanluo-e2e-userdata-'))
  app.setPath('userData', isolatedUserDataDir)
}

const asrService = new AsrService()
const historyStore = new HistoryStore()
const modelDownloader = new ModelDownloader()
const settingsStore = new SettingsStore()
let mainWindow: BrowserWindow | null = null
const voiceWorkerWindow = new VoiceWorkerWindowController()

function getMainWebContents() {
  if (!mainWindow || mainWindow.isDestroyed())
    return null

  const { webContents } = mainWindow
  if (webContents.isDestroyed())
    return null

  return webContents
}

function sendToMainWindow(channel: string, payload?: unknown): void {
  const webContents = getMainWebContents()
  if (!webContents)
    return
  webContents.send(channel, payload)
}

/**
 * Voice HUD 管理器（唯一入口）
 * 所有 HUD 操作必须通过此类
 */
const voiceHudManager = new VoiceHudManager()

const { hotkeyManager, sessionOrchestrator, permissionChecker, initHotkey }
  = createVoiceRuntime({
    asrBaseUrl: asrService.baseUrl,
    getTargetWebContents: () => voiceWorkerWindow.getWebContents(),
    getMainWindow: () => mainWindow,
    settingsStore,
    onUiShow: (payload) => {
      voiceHudManager.show(payload)
      sendToMainWindow(VOICE_IPC.UI_SHOW, payload)
    },
    onUiUpdate: (payload) => {
      if (payload.status === 'recording') {
        voiceHudManager.updateRecording(payload)
      }
      else {
        voiceHudManager.updateFinalizing(payload)
      }
      sendToMainWindow(VOICE_IPC.UI_UPDATE, payload)
    },
    onUiFinal: (payload) => {
      voiceHudManager.showFinal(payload)
      sendToMainWindow(VOICE_IPC.UI_FINAL, payload)

      // 创建历史记录
      const settings = settingsStore.get()
      const isPolishEnabled = settings.polish.enabled && settings.polish.selectedCommandId
      const commandName = isPolishEnabled
        ? settingsStore.getAllPolishCommands().find(c => c.id === settings.polish.selectedCommandId)?.name ?? null
        : null
      const entry = historyStore.create({
        source: 'live',
        entryType: isPolishEnabled ? 'polish' : 'asr_only',
        commandName,
        text: payload.finalText,
        audioPath: payload.audioPath,
        triggeredAt: Date.now(),
      })
      BW.getAllWindows().forEach((win) => {
        win.webContents.send('history:created', entry)
      })
    },
    onUiHide: () => {
      voiceHudManager.hide(300, 'session-end')
      sendToMainWindow(VOICE_IPC.UI_HIDE)
    },
    onUiToast: (payload) => {
      voiceHudManager.showToast(payload)
      sendToMainWindow(VOICE_IPC.UI_TOAST, payload)
    },
  })

const appHandlers = createMainAppHandlers({
  asrService,
  historyStore,
  modelDownloader,
  sessionOrchestrator,
  settingsStore,
  permissionChecker,
  voiceHudManager, // 传递 Manager 而不是 Controller
  voiceWorkerWindow,
  initHotkey,
  createMainWindow: () => createMainWindow({ icon: undefined }),
  getMainWindow: () => {
    if (!mainWindow || mainWindow.isDestroyed())
      return null
    return mainWindow
  },
  setMainWindow: (window) => {
    mainWindow = window
  },
})

registerAppLifecycle({
  onReady: appHandlers.onReady,
  onBrowserWindowCreated: (window) => {
    window.on('blur', () => {
      hotkeyManager.reset('window-blur')
    })
  },
  onActivate: appHandlers.onActivate,
  onBeforeQuit: appHandlers.onBeforeQuit,
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

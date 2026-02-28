import type { VadConfig } from '~shared/voice'
import type { RegisterIpcHandlersOptions } from './types'
import { ipcMain } from 'electron'
import {
  vadConfigSchema,
  vadSetConfigRequestSchema,
  vadSetConfigResponseSchema,
  voiceGetConfigResponseSchema,
  voiceRecordingStartResponseSchema,
  voiceRecordingStopResponseSchema,
  voiceSetConfigRequestSchema,
  voiceSetConfigResponseSchema,
} from '~shared/ipc'
import { VAD_CONFIG_IPC } from '~shared/voice'
import { parsePayload } from './utils'

export function registerVoiceIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { getMainWindow, sessionOrchestrator, settingsStore } = options

  ipcMain.handle('voice:recording:start', async () => {
    const { isHotkeyDisabledGlobally } = await import('../voice/hotkeyState')
    if (isHotkeyDisabledGlobally()) {
      return voiceRecordingStartResponseSchema.parse({
        ok: false as const,
        reason: 'hotkey_disabled',
      })
    }
    await sessionOrchestrator.handleHotkeyPress()
    return voiceRecordingStartResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('voice:recording:stop', async () => {
    await sessionOrchestrator.handleHotkeyRelease()
    return voiceRecordingStopResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('voice:getConfig', async () =>
    voiceGetConfigResponseSchema.parse({
      continueWindowMs: settingsStore.get().voice.continueWindowMs,
    }))

  ipcMain.handle('voice:setConfig', async (_event, payload: unknown) => {
    const validatedPayload = parsePayload(
      'voice:setConfig',
      payload,
      voiceSetConfigRequestSchema,
    )
    if (typeof validatedPayload.continueWindowMs === 'number') {
      const updated = settingsStore.updateVoiceSettings({
        continueWindowMs: validatedPayload.continueWindowMs,
      })
      sessionOrchestrator.setContinueWindowMs?.(updated.voice.continueWindowMs)
    }
    else {
      sessionOrchestrator.setContinueWindowMs?.(
        settingsStore.get().voice.continueWindowMs,
      )
    }
    return voiceSetConfigResponseSchema.parse({
      ok: true as const,
      continueWindowMs: settingsStore.get().voice.continueWindowMs,
    })
  })

  ipcMain.handle(VAD_CONFIG_IPC.GET, async () =>
    vadConfigSchema.parse({
      ...settingsStore.get().voice.vad,
    }))

  ipcMain.handle(VAD_CONFIG_IPC.SET, async (_event, payload: unknown) => {
    const validatedPayload = parsePayload(
      VAD_CONFIG_IPC.SET,
      payload,
      vadSetConfigRequestSchema,
    )
    const updated = settingsStore.updateVadSettings(
      validatedPayload as Partial<VadConfig>,
    )
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send(VAD_CONFIG_IPC.UPDATED, updated.voice.vad)
    }
    return vadSetConfigResponseSchema.parse({
      ok: true as const,
      ...updated.voice.vad,
    })
  })
}

import type { RegisterIpcHandlersOptions } from './types'
import { app, clipboard, ipcMain } from 'electron'
import {
  clipboardWriteTextRequestSchema,
  clipboardWriteTextResponseSchema,
  logsExportRequestSchema,
  logsExportResponseSchema,
  okResponseSchema,
  onboardingSkipStepRequestSchema,
  onboardingStatusResponseSchema,
  permissionKindSchema,
  permissionStatusSchema,
  rendererLogRequestSchema,
  shortcutGetResponseSchema,
  shortcutSetRequestSchema,
  shortcutSetResponseSchema,
} from '~shared/ipc'
import { createLogger, exportRecentLogs } from '../logging'
import { parsePayload } from './utils'

export function registerSystemIpcHandlers(
  options: RegisterIpcHandlersOptions,
): void {
  const { onOnboardingComplete, permissionChecker, sessionOrchestrator, settingsStore } = options
  const log = createLogger('ipc:renderer')

  ipcMain.handle('onboarding:getStatus', async () =>
    onboardingStatusResponseSchema.parse({
      completed: settingsStore.get().onboarding.completed,
      skippedSteps: settingsStore.get().onboarding.skippedSteps,
    }))

  ipcMain.handle('onboarding:complete', async () => {
    settingsStore.completeOnboarding()
    onOnboardingComplete?.()
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('onboarding:skipStep', async (_event, stepId: unknown) => {
    const validatedStepId = parsePayload(
      'onboarding:skipStep',
      stepId,
      onboardingSkipStepRequestSchema,
    )
    settingsStore.skipOnboardingStep(validatedStepId)
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('onboarding:reset', async () => {
    settingsStore.resetOnboarding()
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('permission:check', async (_event, kind: unknown) => {
    const validatedKind = parsePayload(
      'permission:check',
      kind,
      permissionKindSchema,
    )
    const status = await permissionChecker.check(validatedKind)
    return permissionStatusSchema.parse(status)
  })

  ipcMain.handle('permission:request', async (_event, kind: unknown) => {
    const validatedKind = parsePayload(
      'permission:request',
      kind,
      permissionKindSchema,
    )
    const status = await permissionChecker.ensureOrPrompt(validatedKind)
    return permissionStatusSchema.parse(status)
  })

  ipcMain.handle('shortcut:get', async () =>
    shortcutGetResponseSchema.parse(settingsStore.getShortcut()))

  ipcMain.handle('shortcut:set', async (_event, shortcut: unknown) => {
    const validatedShortcut = parsePayload(
      'shortcut:set',
      shortcut,
      shortcutSetRequestSchema,
    )
    settingsStore.setShortcut(validatedShortcut)
    sessionOrchestrator.updateShortcut?.(validatedShortcut ?? '')
    return shortcutSetResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('clipboard:writeText', async (_event, text: unknown) => {
    const validatedText = parsePayload(
      'clipboard:writeText',
      text,
      clipboardWriteTextRequestSchema,
    )
    try {
      clipboard.writeText(validatedText)
      return clipboardWriteTextResponseSchema.parse({ ok: true as const })
    }
    catch (err) {
      return clipboardWriteTextResponseSchema.parse({
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  ipcMain.handle('shortcut:disableGlobal', async () => {
    const { setHotkeyDisabledGlobally } = await import('../voice/hotkeyState')
    setHotkeyDisabledGlobally(true)
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('shortcut:enableGlobal', async () => {
    const { setHotkeyDisabledGlobally } = await import('../voice/hotkeyState')
    setHotkeyDisabledGlobally(false)
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('shortcut:initHotkey', async () => {
    const accessibilityStatus = await permissionChecker.ensureOrPrompt('ACCESSIBILITY')
    if (accessibilityStatus !== 'GRANTED') {
      throw new Error('辅助功能权限未授予，无法启用全局快捷键')
    }
    await sessionOrchestrator.initHotkey?.()
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('log:renderer', async (event, payload: unknown) => {
    const data = parsePayload('log:renderer', payload, rendererLogRequestSchema)
    log[data.level](data.message, {
      rendererScope: data.scope,
      webContentsId: event.sender.id,
      senderUrl: event.sender.getURL(),
      ...data.extra,
    })
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('logs:exportRecent', async (_event, payload: unknown) => {
    const request = parsePayload('logs:exportRecent', payload, logsExportRequestSchema)
    const result = exportRecentLogs(app, {
      minutes: request.minutes ?? 30,
    })
    log.info('exported recent logs', {
      exportPath: result.exportPath,
      lineCount: result.lineCount,
      minutes: result.minutes,
    })
    return logsExportResponseSchema.parse(result)
  })
}

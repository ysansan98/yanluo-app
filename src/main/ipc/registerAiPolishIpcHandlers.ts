import type { RegisterIpcHandlersOptions } from './types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { z } from 'zod'
import {
  aiCheckConfiguredResponseSchema,
  aiGetConfigResponseSchema,
  aiRegistryResponseSchema,
  aiSetActiveProviderRequestSchema,
  aiSetProviderConfigRequestSchema,
  aiValidateProviderResponseSchema,
  okResponseSchema,
  polishAddCommandRequestSchema,
  polishCommandsResponseSchema,
  polishConfigResponseSchema,
  polishRemoveCommandRequestSchema,
  polishSetCommandRequestSchema,
  polishSetEnabledRequestSchema,
  polishUpdateSettingsRequestSchema,
  providerKeySchema,
} from '~shared/ipc'
import { polishEngine } from '../polish/polishEngine'
import {
  maskAiProviderConfigs,
  resolveAiApiKey,
} from './handlerServices'
import { parsePayload } from './utils'

export function registerAiPolishIpcHandlers(
  options: RegisterIpcHandlersOptions,
): void {
  const { settingsStore } = options

  ipcMain.handle('ai:getRegistry', async () => {
    const apiJsonPath = join(app.getAppPath(), 'models.dev', 'api.json')
    const content = readFileSync(apiJsonPath, 'utf-8')
    const providers = JSON.parse(content)
    return aiRegistryResponseSchema.parse({ providers })
  })

  ipcMain.handle('ai:getConfig', async () => {
    const settings = settingsStore.get()
    return aiGetConfigResponseSchema.parse({
      providers: maskAiProviderConfigs(settings.ai.providers),
      activeProviderId: settings.ai.activeProviderId,
      activeModelId: settings.ai.activeModelId,
    })
  })

  ipcMain.handle(
    'ai:setProviderConfig',
    async (_event, providerId: unknown, config: unknown) => {
      const validatedProviderId = parsePayload(
        'ai:setProviderConfig:providerId',
        providerId,
        providerKeySchema,
      )
      const validatedConfig = parsePayload(
        'ai:setProviderConfig:config',
        config,
        aiSetProviderConfigRequestSchema,
      )
      const settings = settingsStore.get()
      const existing = settings.ai.providers[validatedProviderId]
      const apiKey = resolveAiApiKey(validatedConfig.apiKey, existing?.apiKey)

      settingsStore.setAiProviderConfig(validatedProviderId, {
        enabled: true,
        apiKey,
        customApiEndpoint: validatedConfig.customApiEndpoint,
        selectedModelId: validatedConfig.selectedModelId,
      })
      return okResponseSchema.parse({ ok: true as const })
    },
  )

  ipcMain.handle('ai:removeProviderConfig', async (_event, providerId: unknown) => {
    const validatedProviderId = parsePayload(
      'ai:removeProviderConfig',
      providerId,
      providerKeySchema,
    )
    settingsStore.removeAiProviderConfig(validatedProviderId)
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('ai:setActiveProvider', async (_event, providerId: unknown, modelId: unknown) => {
    const validatedPayload = parsePayload(
      'ai:setActiveProvider',
      { providerId, modelId },
      aiSetActiveProviderRequestSchema,
    )
    settingsStore.setActiveProvider(
      validatedPayload.providerId,
      validatedPayload.modelId,
    )
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('ai:checkConfigured', async () =>
    aiCheckConfiguredResponseSchema.parse({
      hasEnabledProvider: settingsStore.hasEnabledAiProvider(),
      isActiveProviderValid: settingsStore.isActiveProviderValid(),
    }))

  ipcMain.handle('ai:validateProvider', async (_event, providerId: unknown, modelId: unknown) => {
    const validatedProviderId = parsePayload(
      'ai:validateProvider:providerId',
      providerId,
      providerKeySchema,
    )
    const validatedModelId = parsePayload(
      'ai:validateProvider:modelId',
      modelId,
      z.string(),
    )
    const result = await polishEngine.validateProvider(
      validatedProviderId,
      validatedModelId,
    )
    return aiValidateProviderResponseSchema.parse(result)
  })

  ipcMain.handle('polish:getConfig', async () => {
    const settings = settingsStore.get()
    return polishConfigResponseSchema.parse({
      enabled: settings.polish.enabled,
      selectedCommandId: settings.polish.selectedCommandId,
      temperature: settings.polish.temperature,
      maxTokens: settings.polish.maxTokens,
    })
  })

  ipcMain.handle('polish:setEnabled', async (_event, enabled: unknown) => {
    const validatedEnabled = parsePayload(
      'polish:setEnabled',
      enabled,
      polishSetEnabledRequestSchema,
    )
    settingsStore.setPolishEnabled(validatedEnabled)
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('polish:setCommand', async (_event, commandId: unknown) => {
    const validatedCommandId = parsePayload(
      'polish:setCommand',
      commandId,
      polishSetCommandRequestSchema,
    )
    settingsStore.setSelectedPolishCommand(validatedCommandId)
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('polish:getCommands', async () =>
    polishCommandsResponseSchema.parse(settingsStore.getAllPolishCommands()))

  ipcMain.handle('polish:addCommand', async (_event, command: unknown) => {
    const validatedCommand = parsePayload(
      'polish:addCommand',
      command,
      polishAddCommandRequestSchema,
    )
    settingsStore.addCustomPolishCommand({
      ...validatedCommand,
      order: validatedCommand.order ?? 100,
    })
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('polish:removeCommand', async (_event, commandId: unknown) => {
    const validatedCommandId = parsePayload(
      'polish:removeCommand',
      commandId,
      polishRemoveCommandRequestSchema,
    )
    settingsStore.removeCustomPolishCommand(validatedCommandId)
    return okResponseSchema.parse({ ok: true as const })
  })

  ipcMain.handle('polish:updateSettings', async (_event, payload: unknown) => {
    const validatedPayload = parsePayload(
      'polish:updateSettings',
      payload,
      polishUpdateSettingsRequestSchema,
    )
    settingsStore.updatePolishSettings(validatedPayload)
    return okResponseSchema.parse({ ok: true as const })
  })
}

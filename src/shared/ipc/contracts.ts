import { z } from 'zod'

// Electron renderer/preload contexts can disallow string code generation.
// Force zod v4 to skip JIT compilation (`new Function`) for schema parsing.
z.config({ jitless: true })

export const providerKeySchema = z.enum([
  'openai',
  'google',
  'anthropic',
  'deepseek',
  'zhipuai',
  'zai-coding-plan',
  'minimax',
  'minimax-coding-plan',
])

export const permissionKindSchema = z.enum(['MICROPHONE', 'ACCESSIBILITY'])

export const permissionStatusSchema = z.enum([
  'GRANTED',
  'DENIED',
  'NOT_DETERMINED',
  'RESTRICTED',
])

export const voiceGetConfigResponseSchema = z.object({
  continueWindowMs: z.number().int(),
})

export const voiceSetConfigRequestSchema = z.object({
  continueWindowMs: z.number().int().optional(),
})

export const voiceSetConfigResponseSchema = z.object({
  ok: z.literal(true),
  continueWindowMs: z.number().int(),
})

export const voiceRecordingStartResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.literal('hotkey_disabled'),
  }),
])

export const voiceRecordingStopResponseSchema = z.object({
  ok: z.literal(true),
})

export const vadConfigSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number(),
  minSpeechMs: z.number().int(),
  redemptionMs: z.number().int(),
  minDurationMs: z.number().int(),
})

export const vadSetConfigRequestSchema = vadConfigSchema.partial()

export const vadSetConfigResponseSchema = z.object({
  ok: z.literal(true),
  enabled: z.boolean(),
  threshold: z.number(),
  minSpeechMs: z.number().int(),
  redemptionMs: z.number().int(),
  minDurationMs: z.number().int(),
})

export const historyCreateRequestSchema = z.object({
  source: z.literal('live'),
  entryType: z.enum(['asr_only', 'polish']),
  commandName: z.string().nullable().optional(),
  text: z.string(),
  language: z.string().optional(),
  elapsedMs: z.number().optional(),
  audioPath: z.string().nullable().optional(),
  triggeredAt: z.number().int().optional(),
})

export const historyEntrySchema = z.object({
  id: z.string(),
  source: z.literal('live'),
  entryType: z.enum(['asr_only', 'polish']),
  commandName: z.string().nullable(),
  text: z.string(),
  textLength: z.number().int(),
  language: z.string(),
  elapsedMs: z.number().int(),
  audioPath: z.string().nullable(),
  triggeredAt: z.number().int(),
  createdAt: z.number().int(),
})

export const historyListRequestSchema = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
  })
  .optional()

export const historyListResponseSchema = z.array(historyEntrySchema)

export const historyReadAudioRequestSchema = z.object({
  path: z.string(),
})

export const historyReadAudioResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    mime: z.string(),
    base64: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    message: z.string(),
  }),
])

export const onboardingSkipStepRequestSchema = z.string().min(1)

export const onboardingStatusResponseSchema = z.object({
  completed: z.boolean(),
  skippedSteps: z.array(z.string()),
})

export const shortcutSetRequestSchema = z.string().nullable()

export const shortcutGetResponseSchema = z.string().nullable()

export const shortcutSetResponseSchema = z.object({
  ok: z.literal(true),
})

export const clipboardWriteTextRequestSchema = z.string()

export const clipboardWriteTextResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
])

export const okResponseSchema = z.object({
  ok: z.literal(true),
})

export const asrHealthResponseSchema = z.object({
  status: z.string(),
  model_loaded: z.boolean(),
  model_error: z.string().nullable().optional(),
})

export const asrModelInfoResponseSchema = z.object({
  modelId: z.string(),
  modelDir: z.string(),
  exists: z.boolean(),
})

export const asrDownloadModelResponseSchema = z.object({
  status: z.enum(['ok', 'exists', 'running']),
})

export const asrDownloadLogEventSchema = z.object({
  type: z.string(),
  message: z.string(),
})

export const asrDownloadProgressSchema = z.object({
  type: z.enum(['start', 'progress', 'file_complete', 'complete', 'error']),
  filename: z.string().optional(),
  downloaded: z.number().optional(),
  total: z.number().optional(),
  percent: z.number().optional(),
  message: z.string().optional(),
  model_id: z.string().optional(),
  local_dir: z.string().optional(),
})

export const aiProviderModelLimitSchema = z.object({
  context: z.number().optional(),
  output: z.number().optional(),
  input: z.number().optional(),
})

export const aiProviderModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  limit: aiProviderModelLimitSchema,
})

export const aiProviderInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  npm: z.string(),
  api: z.string().nullable(),
  env: z.array(z.string()),
  doc: z.string(),
  models: z.record(z.string(), aiProviderModelSchema),
})

export const aiRegistryResponseSchema = z.object({
  providers: z.record(z.string(), aiProviderInfoSchema),
})

export const aiProviderUserConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string(),
  customApiEndpoint: z.string().optional(),
  selectedModelId: z.string().optional(),
})

export const aiGetConfigResponseSchema = z.object({
  providers: z.partialRecord(providerKeySchema, aiProviderUserConfigSchema),
  activeProviderId: providerKeySchema.nullable(),
  activeModelId: z.string().nullable(),
})

export const aiSetProviderConfigRequestSchema = z.object({
  apiKey: z.string().optional(),
  customApiEndpoint: z.string().optional(),
  selectedModelId: z.string().optional(),
})

export const aiSetActiveProviderRequestSchema = z.object({
  providerId: providerKeySchema.nullable(),
  modelId: z.string().nullable(),
})

export const aiCheckConfiguredResponseSchema = z.object({
  hasEnabledProvider: z.boolean(),
  isActiveProviderValid: z.boolean(),
})

export const aiValidateProviderResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
})

export const polishConfigResponseSchema = z.object({
  enabled: z.boolean(),
  selectedCommandId: z.string().nullable(),
  temperature: z.number(),
  maxTokens: z.number().int(),
})

export const polishCommandSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  promptTemplate: z.string(),
  isBuiltIn: z.boolean(),
  order: z.number().int(),
})

export const polishCommandsResponseSchema = z.array(polishCommandSchema)

export const polishSetEnabledRequestSchema = z.boolean()

export const polishSetCommandRequestSchema = z.string().nullable()

export const polishAddCommandRequestSchema = z.object({
  id: z.string(),
  name: z.string(),
  promptTemplate: z.string(),
  icon: z.string().optional(),
  order: z.number().int().optional(),
})

export const polishRemoveCommandRequestSchema = z.string()

export const polishUpdateSettingsRequestSchema = z.object({
  temperature: z.number().optional(),
  maxTokens: z.number().int().optional(),
})

export type VoiceSetConfigRequest = z.infer<typeof voiceSetConfigRequestSchema>
export type VoiceSetConfigResponse = z.infer<typeof voiceSetConfigResponseSchema>
export type VoiceGetConfigResponse = z.infer<typeof voiceGetConfigResponseSchema>
export type VoiceRecordingStartResponse = z.infer<
  typeof voiceRecordingStartResponseSchema
>
export type VoiceRecordingStopResponse = z.infer<
  typeof voiceRecordingStopResponseSchema
>

export type HistoryCreateRequest = z.infer<typeof historyCreateRequestSchema>
export type HistoryListRequest = z.infer<typeof historyListRequestSchema>
export type HistoryListResponse = z.infer<typeof historyListResponseSchema>
export type HistoryEntry = z.infer<typeof historyEntrySchema>
export type HistoryReadAudioRequest = z.infer<typeof historyReadAudioRequestSchema>
export type HistoryReadAudioResponse = z.infer<typeof historyReadAudioResponseSchema>

export type AsrHealthResponse = z.infer<typeof asrHealthResponseSchema>
export type AsrModelInfoResponse = z.infer<typeof asrModelInfoResponseSchema>
export type AsrDownloadModelResponse = z.infer<typeof asrDownloadModelResponseSchema>
export type AsrDownloadProgress = z.infer<typeof asrDownloadProgressSchema>
export type AsrDownloadLogEvent = z.infer<typeof asrDownloadLogEventSchema>

export type ShortcutSetRequest = z.infer<typeof shortcutSetRequestSchema>
export type ShortcutSetResponse = z.infer<typeof shortcutSetResponseSchema>
export type ShortcutGetResponse = z.infer<typeof shortcutGetResponseSchema>

export type AiRegistryResponse = z.infer<typeof aiRegistryResponseSchema>
export type AiGetConfigResponse = z.infer<typeof aiGetConfigResponseSchema>
export type AiSetProviderConfigRequest = z.infer<
  typeof aiSetProviderConfigRequestSchema
>
export type AiSetActiveProviderRequest = z.infer<
  typeof aiSetActiveProviderRequestSchema
>
export type AiCheckConfiguredResponse = z.infer<
  typeof aiCheckConfiguredResponseSchema
>
export type AiValidateProviderResponse = z.infer<
  typeof aiValidateProviderResponseSchema
>

export type PolishConfigResponse = z.infer<typeof polishConfigResponseSchema>
export type PolishCommand = z.infer<typeof polishCommandSchema>
export type PolishCommandsResponse = z.infer<typeof polishCommandsResponseSchema>
export type PolishAddCommandRequest = z.infer<
  typeof polishAddCommandRequestSchema
>
export type PolishUpdateSettingsRequest = z.infer<
  typeof polishUpdateSettingsRequestSchema
>

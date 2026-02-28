import { describe, expect, it } from 'vitest'
import {
  aiSetActiveProviderRequestSchema,
  historyCreateRequestSchema,
  historyReadAudioResponseSchema,
  permissionKindSchema,
  providerKeySchema,
  shortcutSetRequestSchema,
  voiceSetConfigRequestSchema,
} from '../../src/shared/ipc/contracts'

describe('ipc contracts', () => {
  it('accepts valid voice:setConfig payload', () => {
    const result = voiceSetConfigRequestSchema.parse({ continueWindowMs: 1200 })
    expect(result.continueWindowMs).toBe(1200)
  })

  it('rejects invalid voice:setConfig payload', () => {
    expect(() =>
      voiceSetConfigRequestSchema.parse({ continueWindowMs: '1200' })).toThrow()
  })

  it('accepts valid history:create payload', () => {
    const result = historyCreateRequestSchema.parse({
      source: 'live',
      entryType: 'asr_only',
      text: 'hello',
    })
    expect(result.source).toBe('live')
  })

  it('rejects invalid provider key', () => {
    expect(() => providerKeySchema.parse('foo-provider')).toThrow()
  })

  it('validates ai:setActiveProvider request', () => {
    const parsed = aiSetActiveProviderRequestSchema.parse({
      providerId: 'openai',
      modelId: 'gpt-4.1',
    })
    expect(parsed.providerId).toBe('openai')
  })

  it('validates readAudio response union', () => {
    const okRes = historyReadAudioResponseSchema.parse({
      ok: true,
      mime: 'audio/wav',
      base64: 'abc',
    })
    const failRes = historyReadAudioResponseSchema.parse({
      ok: false,
      message: 'file not found',
    })
    expect(okRes.ok).toBe(true)
    expect(failRes.ok).toBe(false)
  })

  it('validates permission kind and shortcut payload', () => {
    expect(permissionKindSchema.parse('MICROPHONE')).toBe('MICROPHONE')
    expect(shortcutSetRequestSchema.parse(null)).toBeNull()
  })
})

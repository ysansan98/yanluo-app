import { describe, expect, it } from 'vitest'
import {
  buildHistoryReadAudioNotOk,
  buildHistoryReadAudioOk,
  getAudioMimeType,
  maskAiProviderConfigs,
  resolveAiApiKey,
} from '../../src/main/ipc/handlerServices'

describe('ipc handler services', () => {
  it('resolves api key with masked placeholder', () => {
    expect(resolveAiApiKey('********', 'real-key')).toBe('real-key')
    expect(resolveAiApiKey('new-key', 'real-key')).toBe('new-key')
    expect(resolveAiApiKey(undefined, 'real-key')).toBe('')
  })

  it('masks ai provider api keys', () => {
    const providers = {
      openai: {
        enabled: true,
        apiKey: 'sk-123',
        selectedModelId: 'gpt-4.1',
      },
    }
    const masked = maskAiProviderConfigs(providers)
    expect(masked.openai?.apiKey).toBe('********')
  })

  it('maps audio mime by extension', () => {
    expect(getAudioMimeType('/tmp/a.wav')).toBe('audio/wav')
    expect(getAudioMimeType('/tmp/a.unknown')).toBe('application/octet-stream')
  })

  it('builds history read audio responses', () => {
    expect(buildHistoryReadAudioNotOk('bad')).toEqual({ ok: false, message: 'bad' })
    expect(buildHistoryReadAudioOk('audio/wav', 'abc')).toEqual({
      ok: true,
      mime: 'audio/wav',
      base64: 'abc',
    })
  })
})

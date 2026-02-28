import type { ProviderKey } from '~shared/ai'
import type {
  AiGetConfigResponse,
  HistoryReadAudioResponse,
} from '~shared/ipc'
import { extname } from 'node:path'

export function resolveAiApiKey(
  incomingApiKey: string | undefined,
  existingApiKey: string | undefined,
): string {
  if (incomingApiKey === '********') {
    return existingApiKey ?? ''
  }
  return incomingApiKey || ''
}

export function maskAiProviderConfigs(
  providers: Partial<AiGetConfigResponse['providers']>,
): AiGetConfigResponse['providers'] {
  const masked: AiGetConfigResponse['providers'] = {}
  for (const [key, provider] of Object.entries(providers)) {
    if (!provider) {
      continue
    }
    masked[key as ProviderKey] = {
      ...provider,
      apiKey: provider.apiKey ? '********' : '',
    }
  }
  return masked
}

export function getAudioMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
  }
  return mimeMap[ext] ?? 'application/octet-stream'
}

export function buildHistoryReadAudioNotOk(
  message: string,
): HistoryReadAudioResponse {
  return {
    ok: false,
    message,
  }
}

export function buildHistoryReadAudioOk(
  mime: string,
  base64: string,
): HistoryReadAudioResponse {
  return {
    ok: true,
    mime,
    base64,
  }
}

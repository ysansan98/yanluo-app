import type {
  CreateHistoryEntryPayload,
  HistoryEntry,
} from '../../src/main/historyStore'
import type { RegisterIpcHandlersOptions } from '../../src/main/ipc/types'
import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'

import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerHistoryIpcHandlers } from '../../src/main/ipc/registerHistoryIpcHandlers'

const tempDir = mkdtempSync(join(tmpdir(), 'yanluo-history-ipc-integration-'))
const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  broadcastSend: vi.fn(),
  getAllWindowsMock: vi.fn(() => []),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: mocked.getAllWindowsMock,
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocked.handlers.set(channel, handler)
    },
  },
}))

class InMemoryHistoryStore {
  private entries: HistoryEntry[] = []

  create(payload: CreateHistoryEntryPayload): HistoryEntry {
    const now = Date.now()
    const text = payload.text.trim()
    const entry: HistoryEntry = {
      id: `${now}-${this.entries.length + 1}`,
      source: payload.source,
      entryType: payload.entryType,
      commandName: payload.commandName ?? null,
      text,
      textLength: text.length,
      language: payload.language ?? 'auto',
      elapsedMs: payload.elapsedMs ?? 0,
      audioPath: payload.audioPath ?? null,
      triggeredAt: payload.triggeredAt ?? now,
      createdAt: now,
    }
    this.entries.unshift(entry)
    return entry
  }

  list(limit = 200): HistoryEntry[] {
    return this.entries.slice(0, limit)
  }

  clear(): void {
    this.entries = []
  }
}

function createBaseOptions(): RegisterIpcHandlersOptions {
  return {
    asrService: {
      health: async () => ({ status: 'ok', model_loaded: true }),
    } as unknown as RegisterIpcHandlersOptions['asrService'],
    historyStore: new InMemoryHistoryStore() as unknown as RegisterIpcHandlersOptions['historyStore'],
    modelDownloader: {
      running: false,
      start: vi.fn(async () => {}),
    } as unknown as RegisterIpcHandlersOptions['modelDownloader'],
    permissionChecker: {
      check: vi.fn(async () => 'GRANTED'),
      ensureOrPrompt: vi.fn(async () => 'GRANTED'),
    } as unknown as RegisterIpcHandlersOptions['permissionChecker'],
    sessionOrchestrator: {
      handleHotkeyPress: vi.fn(async () => {}),
      updateShortcut: vi.fn(),
    } as unknown as RegisterIpcHandlersOptions['sessionOrchestrator'],
    settingsStore: {
      get: vi.fn(() => ({
        onboarding: { completed: false, skippedSteps: [] },
        ai: {
          providers: {},
          activeProviderId: null,
          activeModelId: null,
        },
        polish: {
          enabled: false,
          selectedCommandId: null,
          temperature: 0.3,
          maxTokens: 2000,
          customCommands: [],
        },
        shortcuts: { pushToTalk: null },
        voice: {
          continueWindowMs: 2000,
          vad: {
            enabled: true,
            threshold: 0.5,
            minSpeechMs: 150,
            redemptionMs: 150,
            minDurationMs: 300,
          },
        },
      })),
      completeOnboarding: vi.fn(),
      skipOnboardingStep: vi.fn(),
      resetOnboarding: vi.fn(),
      getShortcut: vi.fn(() => null),
      setShortcut: vi.fn(),
      getAllPolishCommands: vi.fn(() => []),
      hasEnabledAiProvider: vi.fn(() => false),
      isActiveProviderValid: vi.fn(() => false),
      removeAiProviderConfig: vi.fn(),
      setActiveProvider: vi.fn(),
      setAiProviderConfig: vi.fn(),
      setPolishEnabled: vi.fn(),
      setSelectedPolishCommand: vi.fn(),
      updatePolishSettings: vi.fn(),
      addCustomPolishCommand: vi.fn(),
      removeCustomPolishCommand: vi.fn(),
    } as unknown as RegisterIpcHandlersOptions['settingsStore'],
    getMainWindow: () => null,
    onOnboardingComplete: vi.fn(async () => {}),
  }
}

describe('history ipc handlers integration', () => {
  beforeEach(() => {
    mocked.handlers.clear()
    mocked.broadcastSend.mockReset()
    mocked.getAllWindowsMock.mockReturnValue([
      { webContents: { send: mocked.broadcastSend } },
    ])
  })

  it('create/list/clear behaves as observable contract', async () => {
    const options = createBaseOptions()
    registerHistoryIpcHandlers(options)

    const createHandler = mocked.handlers.get('history:create')!
    const listHandler = mocked.handlers.get('history:list')!
    const clearHandler = mocked.handlers.get('history:clear')!

    const created = await createHandler(undefined, {
      source: 'live',
      entryType: 'asr_only',
      text: '  hello world  ',
      elapsedMs: 1234,
    })

    expect(created).toMatchObject({
      source: 'live',
      entryType: 'asr_only',
      text: 'hello world',
      textLength: 11,
      elapsedMs: 1234,
    })
    expect(mocked.broadcastSend).toHaveBeenCalledWith('history:created', created)

    const listed = await listHandler(undefined, { limit: 10 })
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ text: 'hello world' })

    const cleared = await clearHandler()
    expect(cleared).toEqual({ ok: true })
    const listedAfterClear = await listHandler(undefined, { limit: 10 })
    expect(listedAfterClear).toHaveLength(0)
  })

  it('readAudio returns base64 payload for existing wav file', async () => {
    const options = createBaseOptions()
    registerHistoryIpcHandlers(options)

    const audioPath = join(tempDir, 'sample.wav')
    const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46])
    writeFileSync(audioPath, bytes)

    const readAudioHandler = mocked.handlers.get('history:readAudio')!
    const result = await readAudioHandler(undefined, { path: audioPath })

    expect(result).toEqual({
      ok: true,
      mime: 'audio/wav',
      base64: bytes.toString('base64'),
    })
  })
})

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

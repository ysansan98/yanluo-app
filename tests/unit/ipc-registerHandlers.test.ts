import type { RegisterIpcHandlersOptions } from '../../src/main/ipc/types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerAiPolishIpcHandlers } from '../../src/main/ipc/registerAiPolishIpcHandlers'
import { registerAsrIpcHandlers } from '../../src/main/ipc/registerAsrIpcHandlers'
import { registerHistoryIpcHandlers } from '../../src/main/ipc/registerHistoryIpcHandlers'
import { registerSystemIpcHandlers } from '../../src/main/ipc/registerSystemIpcHandlers'

const tmpAppDir = mkdtempSync(join(tmpdir(), 'yanluo-ipc-test-'))
const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  clipboardWriteTextMock: vi.fn(),
  getAllWindowsMock: vi.fn(() => []),
  getAppPathMock: vi.fn(() => tmpAppDir),
  modelExistsMock: vi.fn(() => false),
  validateProviderMock: vi.fn(async () => ({ ok: true, message: 'ok' })),
}))

vi.mock('electron', () => ({
  app: {
    getAppPath: mocked.getAppPathMock,
  },
  BrowserWindow: {
    getAllWindows: mocked.getAllWindowsMock,
  },
  clipboard: {
    writeText: mocked.clipboardWriteTextMock,
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocked.handlers.set(channel, handler)
    },
  },
}))

vi.mock('../../src/main/modelManager', () => ({
  getModelDir: () => '/tmp/models',
  getModelId: () => 'demo-model',
  modelExists: mocked.modelExistsMock,
}))

vi.mock('../../src/main/polish/polishEngine', () => ({
  polishEngine: {
    validateProvider: mocked.validateProviderMock,
  },
}))

function createBaseOptions(): RegisterIpcHandlersOptions {
  return {
    asrService: {
      health: async () => ({ status: 'ok', model_loaded: true }),
    } as unknown as RegisterIpcHandlersOptions['asrService'],
    historyStore: {
      clear: vi.fn(),
      create: vi.fn(payload => ({
        id: 'id-1',
        source: payload.source,
        entryType: payload.entryType,
        commandName: payload.commandName ?? null,
        text: payload.text,
        textLength: payload.text.length,
        language: payload.language ?? 'auto',
        elapsedMs: payload.elapsedMs ?? 0,
        audioPath: payload.audioPath ?? null,
        triggeredAt: payload.triggeredAt ?? Date.now(),
        createdAt: Date.now(),
      })),
      list: vi.fn(() => []),
    } as unknown as RegisterIpcHandlersOptions['historyStore'],
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
      completeOnboarding: vi.fn(),
      get: vi.fn(() => ({
        onboarding: { completed: false, skippedSteps: [] },
        ai: {
          providers: {
            openai: {
              enabled: true,
              apiKey: 'secret-key',
              selectedModelId: 'gpt-4.1',
            },
          },
          activeProviderId: 'openai',
          activeModelId: 'gpt-4.1',
        },
        polish: {
          enabled: false,
          selectedCommandId: null,
          temperature: 0.3,
          maxTokens: 2000,
        },
        shortcuts: { pushToTalk: 'Ctrl + Z' },
        voice: {
          continueWindowMs: 2000,
        },
      })),
      getAllPolishCommands: vi.fn(() => []),
      getShortcut: vi.fn(() => 'Ctrl + Z'),
      hasEnabledAiProvider: vi.fn(() => true),
      isActiveProviderValid: vi.fn(() => true),
      removeAiProviderConfig: vi.fn(),
      resetOnboarding: vi.fn(),
      setActiveProvider: vi.fn(),
      setAiProviderConfig: vi.fn(),
      setPolishEnabled: vi.fn(),
      setSelectedPolishCommand: vi.fn(),
      setShortcut: vi.fn(),
      skipOnboardingStep: vi.fn(),
      updatePolishSettings: vi.fn(),
      addCustomPolishCommand: vi.fn(),
      removeCustomPolishCommand: vi.fn(),
    } as unknown as RegisterIpcHandlersOptions['settingsStore'],
    getMainWindow: () => null,
    onOnboardingComplete: vi.fn(async () => {}),
  }
}

describe('ipc register handlers', () => {
  beforeEach(() => {
    mocked.handlers.clear()
    vi.clearAllMocks()
    mocked.modelExistsMock.mockReturnValue(false)
    mocked.getAllWindowsMock.mockReturnValue([])
  })

  it('asr:downloadModel throws when main window not ready', async () => {
    const options = createBaseOptions()
    registerAsrIpcHandlers(options)

    const handler = mocked.handlers.get('asr:downloadModel')!
    await expect(handler()).rejects.toThrow('Window not ready')
  })

  it('asr:downloadModel returns running when downloader is in progress', async () => {
    const options = createBaseOptions()
    options.getMainWindow = () => ({ webContents: { send: vi.fn() } }) as never
    options.modelDownloader = {
      get running() {
        return true
      },
      start: vi.fn(async () => {}),
    } as never
    registerAsrIpcHandlers(options)

    const handler = mocked.handlers.get('asr:downloadModel')!
    const result = await handler()

    expect(result).toEqual({ status: 'running' })
    expect(options.modelDownloader.start).not.toHaveBeenCalled()
  })

  it('history:create surfaces store errors to caller', async () => {
    const options = createBaseOptions()
    const storeError = new Error('db write failed')
    options.historyStore.create = vi.fn(() => {
      throw storeError
    }) as never
    registerHistoryIpcHandlers(options)

    const handler = mocked.handlers.get('history:create')!

    await expect(handler(undefined, {
      source: 'live',
      entryType: 'asr_only',
      text: 'hello',
    })).rejects.toThrow('db write failed')
  })

  it('history:readAudio returns not found for missing file', async () => {
    const options = createBaseOptions()
    registerHistoryIpcHandlers(options)

    const handler = mocked.handlers.get('history:readAudio')!
    const result = await handler(undefined, { path: '/not-exists.wav' })

    expect(result).toEqual({ ok: false, message: 'file not found' })
  })

  it('permission:request returns denied status from checker', async () => {
    const options = createBaseOptions()
    options.permissionChecker.ensureOrPrompt = vi.fn(async () => 'DENIED') as never
    registerSystemIpcHandlers(options)

    const handler = mocked.handlers.get('permission:request')!
    const result = await handler(undefined, 'MICROPHONE')

    expect(result).toBe('DENIED')
  })

  it('shortcut:set validates payload and updates shortcut state', async () => {
    const options = createBaseOptions()
    registerSystemIpcHandlers(options)

    const handler = mocked.handlers.get('shortcut:set')!
    const result = await handler(undefined, 'Alt + Space')

    expect(result).toEqual({ ok: true })
    expect(options.settingsStore.setShortcut).toHaveBeenCalledWith('Alt + Space')
    expect(options.sessionOrchestrator.updateShortcut).toHaveBeenCalledWith('Alt + Space')
  })

  it('clipboard:writeText returns error object when write fails', async () => {
    mocked.clipboardWriteTextMock.mockImplementationOnce(() => {
      throw new Error('deny')
    })
    const options = createBaseOptions()
    registerSystemIpcHandlers(options)

    const handler = mocked.handlers.get('clipboard:writeText')!
    const result = await handler(undefined, 'hello')

    expect(result).toEqual({ ok: false, error: 'deny' })
  })

  it('ai:getRegistry fails when registry json is invalid', async () => {
    const apiDir = join(tmpAppDir, 'models.dev')
    mkdirSync(apiDir, { recursive: true })
    writeFileSync(join(apiDir, 'api.json'), '{bad json', 'utf-8')

    const options = createBaseOptions()
    registerAiPolishIpcHandlers(options)

    const handler = mocked.handlers.get('ai:getRegistry')!
    await expect(handler()).rejects.toThrow()
  })

  it('ai:setProviderConfig keeps existing key when payload is masked', async () => {
    const options = createBaseOptions()
    registerAiPolishIpcHandlers(options)

    const handler = mocked.handlers.get('ai:setProviderConfig')!
    await handler(undefined, 'openai', {
      apiKey: '********',
      selectedModelId: 'gpt-4.1',
    })

    expect(options.settingsStore.setAiProviderConfig).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({ apiKey: 'secret-key' }),
    )
  })

  it('ai:validateProvider rejects invalid provider id by schema', async () => {
    const options = createBaseOptions()
    registerAiPolishIpcHandlers(options)

    const handler = mocked.handlers.get('ai:validateProvider')!
    await expect(handler(undefined, 'unknown', 'model')).rejects.toThrow(
      /Invalid payload/,
    )
    expect(mocked.validateProviderMock).not.toHaveBeenCalled()
  })
})

afterAll(() => {
  rmSync(tmpAppDir, { recursive: true, force: true })
})

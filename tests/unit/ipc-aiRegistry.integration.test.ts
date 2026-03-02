import type { RegisterIpcHandlersOptions } from '../../src/main/ipc/types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerAiPolishIpcHandlers } from '../../src/main/ipc/registerAiPolishIpcHandlers'

const tempAppDir = mkdtempSync(join(tmpdir(), 'yanluo-ai-registry-ipc-'))
const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getAppPathMock: vi.fn(() => tempAppDir),
  validateProviderMock: vi.fn(async () => ({ ok: true, message: 'ok' })),
}))

vi.mock('electron', () => ({
  app: {
    getAppPath: mocked.getAppPathMock,
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocked.handlers.set(channel, handler)
    },
  },
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
      create: vi.fn(),
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
      get: vi.fn(() => ({
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

function writeRegistry(content: string): void {
  const dir = join(tempAppDir, 'models.dev')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'api.json'), content, 'utf-8')
}

describe('ai:getRegistry integration', () => {
  beforeEach(() => {
    mocked.handlers.clear()
    vi.clearAllMocks()
  })

  it('returns parsed providers for valid registry fixture', async () => {
    writeRegistry(JSON.stringify({
      openai: {
        id: 'openai',
        name: 'OpenAI',
        npm: '@ai-sdk/openai',
        api: 'https://api.openai.com/v1',
        env: ['OPENAI_API_KEY'],
        doc: 'https://platform.openai.com/docs',
        models: {
          'gpt-4.1': {
            id: 'gpt-4.1',
            name: 'GPT-4.1',
            limit: {
              context: 128000,
              output: 16384,
            },
          },
        },
      },
    }))

    const options = createBaseOptions()
    registerAiPolishIpcHandlers(options)

    const handler = mocked.handlers.get('ai:getRegistry')!
    const result = await handler()

    expect(result).toMatchObject({
      providers: {
        openai: {
          id: 'openai',
          name: 'OpenAI',
        },
      },
    })
  })

  it('throws when registry fixture is missing required fields', async () => {
    writeRegistry(JSON.stringify({
      openai: {
        id: 'openai',
        name: 'OpenAI',
        models: {},
      },
    }))

    const options = createBaseOptions()
    registerAiPolishIpcHandlers(options)

    const handler = mocked.handlers.get('ai:getRegistry')!
    await expect(handler()).rejects.toThrow()
  })

  it('throws when registry fixture file does not exist', async () => {
    const missingRoot = mkdtempSync(join(tmpdir(), 'yanluo-ai-registry-missing-'))
    mocked.getAppPathMock.mockReturnValueOnce(missingRoot)

    const options = createBaseOptions()
    registerAiPolishIpcHandlers(options)

    const handler = mocked.handlers.get('ai:getRegistry')!
    await expect(handler()).rejects.toThrow(/no such file|ENOENT/i)

    rmSync(missingRoot, { recursive: true, force: true })
  })
})

afterAll(() => {
  rmSync(tempAppDir, { recursive: true, force: true })
})

import type { RegisterIpcHandlersOptions } from '../../src/main/ipc/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerTestIpcHandlers } from '../../src/main/ipc/registerTestIpcHandlers'

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

function createBaseOptions(): RegisterIpcHandlersOptions {
  return {
    asrService: {
      health: async () => ({ status: 'ok', model_loaded: true }),
    } as unknown as RegisterIpcHandlersOptions['asrService'],
    historyStore: {
      clear: vi.fn(),
      create: vi.fn((payload) => {
        const now = Date.now()
        return {
          id: `${now}-1`,
          source: payload.source,
          entryType: payload.entryType,
          commandName: payload.commandName ?? null,
          text: payload.text,
          textLength: payload.text.length,
          language: payload.language ?? 'auto',
          elapsedMs: payload.elapsedMs ?? 0,
          audioPath: payload.audioPath ?? null,
          triggeredAt: payload.triggeredAt ?? now,
          createdAt: now,
        }
      }),
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
        onboarding: { completed: false, skippedSteps: [] },
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

describe('test ipc handlers integration', () => {
  beforeEach(() => {
    mocked.handlers.clear()
    mocked.broadcastSend.mockReset()
    mocked.getAllWindowsMock.mockReturnValue([
      { webContents: { send: mocked.broadcastSend } },
    ] as never)
  })

  it('test shortcut hook triggers orchestrator with test options', async () => {
    const options = createBaseOptions()
    registerTestIpcHandlers(options)

    const handler = mocked.handlers.get('test:shortcut:triggerHub')
    expect(handler).toBeTypeOf('function')

    const result = await handler?.()
    expect(result).toEqual({ ok: true })
    expect(options.sessionOrchestrator.handleHotkeyPress).toHaveBeenCalledWith({
      skipPrerequisiteChecks: true,
      testUiOnly: true,
    })
  })

  it('test history hook creates and broadcasts history entry', async () => {
    const options = createBaseOptions()
    registerTestIpcHandlers(options)

    const handler = mocked.handlers.get('test:history:push')
    expect(handler).toBeTypeOf('function')

    const result = await handler?.(undefined, 'fixture message')
    expect(result).toMatchObject({
      source: 'live',
      entryType: 'asr_only',
      text: 'fixture message',
      language: 'zh',
    })
    expect(mocked.broadcastSend).toHaveBeenCalledWith('history:created', result)
  })
})

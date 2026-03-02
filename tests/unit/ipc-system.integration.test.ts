import type { RegisterIpcHandlersOptions } from '../../src/main/ipc/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerSystemIpcHandlers } from '../../src/main/ipc/registerSystemIpcHandlers'
import { isHotkeyDisabledGlobally, setHotkeyDisabledGlobally } from '../../src/main/voice/hotkeyState'

const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  clipboardWriteTextMock: vi.fn(),
}))

vi.mock('electron', () => ({
  clipboard: {
    writeText: mocked.clipboardWriteTextMock,
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
      completeOnboarding: vi.fn(),
      get: vi.fn(() => ({
        onboarding: { completed: false, skippedSteps: [] },
      })),
      getShortcut: vi.fn(() => 'Ctrl + Z'),
      skipOnboardingStep: vi.fn(),
      resetOnboarding: vi.fn(),
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

describe('system ipc handlers integration', () => {
  beforeEach(() => {
    mocked.handlers.clear()
    vi.clearAllMocks()
    setHotkeyDisabledGlobally(false)
  })

  it('permission handlers return checker statuses via contract', async () => {
    const options = createBaseOptions()
    options.permissionChecker.check = vi.fn(async () => 'RESTRICTED') as never
    options.permissionChecker.ensureOrPrompt = vi.fn(async () => 'DENIED') as never
    registerSystemIpcHandlers(options)

    const checkHandler = mocked.handlers.get('permission:check')!
    const requestHandler = mocked.handlers.get('permission:request')!

    await expect(checkHandler(undefined, 'MICROPHONE')).resolves.toBe('RESTRICTED')
    await expect(requestHandler(undefined, 'ACCESSIBILITY')).resolves.toBe('DENIED')
  })

  it('shortcut:set with null keeps contract and clears runtime shortcut', async () => {
    const options = createBaseOptions()
    registerSystemIpcHandlers(options)

    const handler = mocked.handlers.get('shortcut:set')!
    const result = await handler(undefined, null)

    expect(result).toEqual({ ok: true })
    expect(options.settingsStore.setShortcut).toHaveBeenCalledWith(null)
    expect(options.sessionOrchestrator.updateShortcut).toHaveBeenCalledWith('')
  })

  it('clipboard:writeText returns normalized error when clipboard throws', async () => {
    mocked.clipboardWriteTextMock.mockImplementationOnce(() => {
      throw new Error('clipboard denied')
    })
    const options = createBaseOptions()
    registerSystemIpcHandlers(options)

    const handler = mocked.handlers.get('clipboard:writeText')!
    const result = await handler(undefined, 'hello')

    expect(result).toEqual({ ok: false, error: 'clipboard denied' })
  })

  it('global hotkey disable/enable handlers toggle shared state', async () => {
    const options = createBaseOptions()
    registerSystemIpcHandlers(options)

    const disableHandler = mocked.handlers.get('shortcut:disableGlobal')!
    const enableHandler = mocked.handlers.get('shortcut:enableGlobal')!

    await disableHandler()
    expect(isHotkeyDisabledGlobally()).toBe(true)

    await enableHandler()
    expect(isHotkeyDisabledGlobally()).toBe(false)
  })

  it('test shortcut hook triggers orchestrator with test options', async () => {
    const options = createBaseOptions()
    registerSystemIpcHandlers(options)

    const handler = mocked.handlers.get('test:shortcut:triggerHub')
    expect(handler).toBeTypeOf('function')

    const result = await handler?.()
    expect(result).toEqual({ ok: true })
    expect(options.sessionOrchestrator.handleHotkeyPress).toHaveBeenCalledWith({
      skipPrerequisiteChecks: true,
      testUiOnly: true,
    })
  })
})

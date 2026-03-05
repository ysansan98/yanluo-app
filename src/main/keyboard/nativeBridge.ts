import type { NativeKeyboardBridge, NativeKeyEvent } from './types'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'

interface NativeKeyboardBridgeOptions {
  resourcesPath: string
  log?: (message: string, extra?: Record<string, unknown>) => void
}

type NativeStartFn = (callbackPtr: unknown) => number | boolean

type NativeStopFn = () => void

type NativeSetHotkeysFn = (json: string) => void

type NativeResetFn = () => void

type NativeSetIntervalFn = (ms: number) => void

class StubNativeKeyboardBridge implements NativeKeyboardBridge {
  start(_callback: (event: NativeKeyEvent) => void): boolean {
    return false
  }

  stop(): void {}

  setHotkeys(_hotkeys: string[][]): void {}

  resetPressed(): void {}

  setPollIntervalMs(_ms: number): void {}
}

class FfiNativeKeyboardBridge implements NativeKeyboardBridge {
  private static readonly require = createRequire(import.meta.url)

  private readonly lib: any
  private readonly koffi: any
  private readonly callbackType: any
  private callbackPtr: any = null

  private readonly startFn: NativeStartFn
  private readonly stopFn: NativeStopFn
  private readonly setHotkeysFn: NativeSetHotkeysFn
  private readonly resetFn: NativeResetFn
  private readonly setIntervalFn: NativeSetIntervalFn

  constructor(libraryPath: string) {
    const koffi = FfiNativeKeyboardBridge.require('koffi')
    const lib = koffi.load(libraryPath)
    const callbackType = koffi.proto('void KeyboardEventCallback(int32_t, const char*, int32_t, int64_t, int32_t)')

    this.koffi = koffi
    this.lib = lib
    this.callbackType = callbackType

    this.startFn = this.lib.func('keyboardStart', 'bool', [koffi.pointer(callbackType)])
    this.stopFn = this.lib.func('keyboardStop', 'void', [])
    this.setHotkeysFn = this.lib.func('keyboardSetHotkeys', 'void', ['str'])
    this.resetFn = this.lib.func('keyboardResetPressed', 'void', [])
    this.setIntervalFn = this.lib.func('keyboardSetPollIntervalMs', 'void', ['int32'])
  }

  start(callback: (event: NativeKeyEvent) => void): boolean {
    if (this.callbackPtr) {
      this.stop()
    }

    this.callbackPtr = this.koffi.register((code: number, name: string | null, eventType: number, ts: number, sourceType: number) => {
      callback({
        code,
        name: name ?? '',
        type: eventType === 1 ? 'down' : 'up',
        timestamp: Number(ts),
        source: sourceType === 1 ? 'synthetic' : 'physical',
      })
    }, this.koffi.pointer(this.callbackType))

    return Boolean(this.startFn(this.callbackPtr))
  }

  stop(): void {
    try {
      this.stopFn()
    }
    finally {
      if (this.callbackPtr) {
        this.koffi.unregister(this.callbackPtr)
        this.callbackPtr = null
      }
    }
  }

  setHotkeys(hotkeys: string[][]): void {
    this.setHotkeysFn(JSON.stringify(hotkeys))
  }

  resetPressed(): void {
    this.resetFn()
  }

  setPollIntervalMs(ms: number): void {
    this.setIntervalFn(Math.max(1, Math.floor(ms)))
  }
}

function resolveNativeLibraryPath(resourcesPath: string): string | null {
  if (process.platform === 'darwin') {
    const path = join(resourcesPath, 'lib', 'keyboard-helper', 'build', 'libKeyboardHelper.dylib')
    return existsSync(path) ? path : null
  }

  if (process.platform === 'win32') {
    const path = join(resourcesPath, 'lib', 'keyboard-helper', 'build', 'KeyboardHelper.dll')
    return existsSync(path) ? path : null
  }

  return null
}

export function createNativeKeyboardBridge(options: NativeKeyboardBridgeOptions): NativeKeyboardBridge {
  const log = options.log ?? (() => {})
  const libraryPath = resolveNativeLibraryPath(options.resourcesPath)

  if (!libraryPath) {
    log('native keyboard library not found, fallback to stub', {
      platform: process.platform,
      resourcesPath: options.resourcesPath,
    })
    return new StubNativeKeyboardBridge()
  }

  try {
    return new FfiNativeKeyboardBridge(libraryPath)
  }
  catch (error) {
    log('failed to initialize native keyboard bridge, fallback to stub', {
      platform: process.platform,
      libraryPath,
      error: error instanceof Error ? error.message : String(error),
    })
    return new StubNativeKeyboardBridge()
  }
}

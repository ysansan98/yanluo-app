import {
  GlobalKeyboardListener,
  type IGlobalKeyDownMap,
  type IGlobalKeyEvent,
  type IGlobalKeyListener,
} from 'node-global-key-listener'
import type { HotkeyManager, VoiceError } from './types'

interface HotkeyManagerOptions {
  targetKey?: '0'
  log?: (message: string, extra?: Record<string, unknown>) => void
}

const META_KEYS = ['LEFT META', 'RIGHT META'] as const
const HOTKEY_KEY = '0'

export class MacGlobalHotkeyManager implements HotkeyManager {
  private readonly keyboard = new GlobalKeyboardListener({
    mac: {
      onError: (errorCode) => {
        this.emitError({
          code: 'E_HOTKEY_UNAVAILABLE',
          message: `Global hotkey server error: ${String(errorCode ?? 'unknown')}`,
          recoverable: true,
        })
      },
    },
  })

  private readonly targetKey: '0'
  private readonly log: (message: string, extra?: Record<string, unknown>) => void
  private readonly listener: IGlobalKeyListener

  private started = false
  private hotkeyPressed = false
  private pressHandler: (() => void) | null = null
  private releaseHandler: (() => void) | null = null
  private errorHandler: ((err: VoiceError) => void) | null = null

  constructor(options: HotkeyManagerOptions = {}) {
    this.targetKey = options.targetKey ?? HOTKEY_KEY
    this.log = options.log ?? ((message, extra) => console.info(`[hotkey] ${message}`, extra ?? {}))
    this.listener = (event, isDown) => this.handleEvent(event, isDown)
  }

  async start(): Promise<void> {
    if (this.started)
      return

    try {
      await this.keyboard.addListener(this.listener)
      this.started = true
      this.log('registered global key listener', { combo: `META+${this.targetKey}` })
    }
    catch (error) {
      this.emitError({
        code: 'E_HOTKEY_UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
        recoverable: false,
      })
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.started)
      return

    this.keyboard.removeListener(this.listener)
    this.keyboard.kill()
    this.started = false
    this.reset('stop')
    this.log('unregistered global key listener', { combo: `META+${this.targetKey}` })
  }

  reset(reason = 'manual-reset'): void {
    if (this.hotkeyPressed) {
      this.hotkeyPressed = false
      this.releaseHandler?.()
      this.log('release (reset)', { reason })
    }
  }

  onPress(cb: () => void): void {
    this.pressHandler = cb
  }

  onRelease(cb: () => void): void {
    this.releaseHandler = cb
  }

  onError(cb: (err: VoiceError) => void): void {
    this.errorHandler = cb
  }

  private handleEvent(event: IGlobalKeyEvent, isDown: IGlobalKeyDownMap): void {
    const hasMeta = META_KEYS.some(key => Boolean(isDown[key]))
    const hasTarget = Boolean(isDown[this.targetKey])
    const comboDown = hasMeta && hasTarget

    if (comboDown && !this.hotkeyPressed && event.state === 'DOWN') {
      this.hotkeyPressed = true
      this.log('press', { key: event.name, state: event.state })
      this.pressHandler?.()
      return
    }

    if (!comboDown && this.hotkeyPressed) {
      this.hotkeyPressed = false
      this.log('release', { key: event.name, state: event.state })
      this.releaseHandler?.()
    }
  }

  private emitError(err: VoiceError): void {
    this.log('error', { code: err.code, message: err.message })
    this.errorHandler?.(err)
  }
}

export class StubHotkeyManager implements HotkeyManager {
  private pressHandler: (() => void) | null = null
  private releaseHandler: (() => void) | null = null
  private errorHandler: ((err: VoiceError) => void) | null = null

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  reset(_reason?: string): void {}

  onPress(cb: () => void): void {
    this.pressHandler = cb
  }

  onRelease(cb: () => void): void {
    this.releaseHandler = cb
  }

  onError(cb: (err: VoiceError) => void): void {
    this.errorHandler = cb
  }

  // Manual triggers for local development before native hotkey integration.
  triggerPress(): void {
    this.pressHandler?.()
  }

  triggerRelease(): void {
    this.releaseHandler?.()
  }

  triggerError(err: VoiceError): void {
    this.errorHandler?.(err)
  }
}

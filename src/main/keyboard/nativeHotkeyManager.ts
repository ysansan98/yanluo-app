import type { HotkeyManager, VoiceError } from '../voice/types'
import type { NativeKeyboardBridge, NativeKeyEvent } from './types'
import {
  formatHotkeyShortcut,
  isHotkeyMatched,
  parseHotkeyShortcut,
} from './hotkeyMatcher'
import { createNativeKeyboardBridge } from './nativeBridge'

interface NativeHotkeyManagerOptions {
  resourcesPath: string
  shortcut?: string
  shouldProcess?: () => boolean
  log?: (message: string, extra?: Record<string, unknown>) => void
  bridge?: NativeKeyboardBridge
}

export class NativeHotkeyManager implements HotkeyManager {
  private readonly bridge: NativeKeyboardBridge
  private readonly shouldProcess: () => boolean
  private readonly log: (message: string, extra?: Record<string, unknown>) => void

  private config = parseHotkeyShortcut(undefined)
  private pressedNames = new Set<string>()
  private hotkeyPressed = false
  private started = false

  private pressHandler: (() => void) | null = null
  private releaseHandler: (() => void) | null = null
  private errorHandler: ((err: VoiceError) => void) | null = null

  constructor(options: NativeHotkeyManagerOptions) {
    this.log = options.log ?? (() => {})
    this.shouldProcess = () => options.shouldProcess?.() ?? true
    this.config = parseHotkeyShortcut(options.shortcut)
    this.bridge = options.bridge
      ?? createNativeKeyboardBridge({
        resourcesPath: options.resourcesPath,
        log: this.log,
      })
    this.bridge.setHotkeys(this.toBridgeHotkeys())
  }

  updateShortcut(shortcut: string): void {
    const before = formatHotkeyShortcut(this.config)
    this.config = parseHotkeyShortcut(shortcut)
    this.bridge.setHotkeys(this.toBridgeHotkeys())
    this.log('shortcut updated', {
      from: before,
      to: formatHotkeyShortcut(this.config),
    })
  }

  async start(): Promise<void> {
    if (this.started)
      return

    const ok = this.bridge.start(event => this.handleNativeEvent(event))
    if (!ok) {
      this.emitError({
        code: 'E_HOTKEY_UNAVAILABLE',
        message: 'native keyboard monitor is unavailable',
        recoverable: true,
      })
      return
    }

    this.started = true
    this.log('native keyboard listener started', {
      shortcut: formatHotkeyShortcut(this.config),
    })
  }

  isRunning(): boolean {
    return this.started
  }

  async stop(): Promise<void> {
    if (!this.started)
      return

    this.bridge.stop()
    this.started = false
    this.reset('stop')
    this.log('native keyboard listener stopped')
  }

  reset(reason?: string): void {
    this.bridge.resetPressed()
    this.pressedNames.clear()
    if (this.hotkeyPressed) {
      this.hotkeyPressed = false
      this.releaseHandler?.()
      this.log('release (reset)', { reason: reason ?? 'manual-reset' })
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

  private handleNativeEvent(event: NativeKeyEvent): void {
    if (!this.shouldProcess() || !this.config.enabled)
      return

    const keyName = event.name.toUpperCase()

    if (event.type === 'down') {
      this.pressedNames.add(keyName)
    }
    else {
      this.pressedNames.delete(keyName)
    }

    const matched = isHotkeyMatched(this.config, {
      names: [...this.pressedNames],
      primaryKey: this.config.primaryKey,
    })

    if (event.type === 'down' && matched && !this.hotkeyPressed) {
      this.hotkeyPressed = true
      this.log('press', { key: keyName })
      this.pressHandler?.()
      return
    }

    if (!matched && this.hotkeyPressed) {
      this.hotkeyPressed = false
      this.log('release', { key: keyName })
      this.releaseHandler?.()
    }
  }

  private toBridgeHotkeys(): string[][] {
    if (!this.config.enabled)
      return []

    const parts: string[] = []
    for (const group of this.config.modifierGroups) {
      parts.push(group[0])
    }
    if (this.config.primaryKey) {
      parts.push(this.config.primaryKey)
    }
    return parts.length > 0 ? [parts] : []
  }

  private emitError(err: VoiceError): void {
    this.log('error', { code: err.code, message: err.message })
    this.errorHandler?.(err)
  }
}

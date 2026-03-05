import type { HotkeyManager, VoiceError } from '../voice/types'

export class StubHotkeyManager implements HotkeyManager {
  private pressHandler: (() => void) | null = null
  private releaseHandler: (() => void) | null = null
  private errorHandler: ((err: VoiceError) => void) | null = null

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  reset(_reason?: string): void {}

  updateShortcut(_shortcut: string): void {}

  onPress(cb: () => void): void {
    this.pressHandler = cb
  }

  onRelease(cb: () => void): void {
    this.releaseHandler = cb
  }

  onError(cb: (err: VoiceError) => void): void {
    this.errorHandler = cb
  }

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

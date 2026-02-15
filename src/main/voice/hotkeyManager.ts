import type { HotkeyManager } from './types'

export class StubHotkeyManager implements HotkeyManager {
  private pressHandler: (() => void) | null = null
  private releaseHandler: (() => void) | null = null

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  onPress(cb: () => void): void {
    this.pressHandler = cb
  }

  onRelease(cb: () => void): void {
    this.releaseHandler = cb
  }

  // Manual triggers for local development before native hotkey integration.
  triggerPress(): void {
    this.pressHandler?.()
  }

  triggerRelease(): void {
    this.releaseHandler?.()
  }
}

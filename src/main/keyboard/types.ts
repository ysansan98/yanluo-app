export type NativeKeyEventType = 'down' | 'up'

export interface NativeKeyEvent {
  code: number
  name: string
  type: NativeKeyEventType
  timestamp: number
  source: 'physical' | 'synthetic'
}

export interface NativeKeyboardBridge {
  start: (callback: (event: NativeKeyEvent) => void) => boolean
  stop: () => void
  setHotkeys: (hotkeys: string[][]) => void
  resetPressed: () => void
  setPollIntervalMs: (ms: number) => void
}

export interface HotkeyDefinition {
  modifierGroups: string[][]
  primaryKey: string | null
  enabled: boolean
}

export interface HotkeyPressedSnapshot {
  names: string[]
  primaryKey: string | null
}

export interface KeyboardBridgeLog {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  extra?: Record<string, unknown>
}

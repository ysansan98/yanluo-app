import type { HotkeyManager } from '../voice/types'
import process from 'node:process'
import { NativeHotkeyManager } from './nativeHotkeyManager'
import { StubHotkeyManager } from './stubHotkeyManager'

interface CreateHotkeyManagerOptions {
  resourcesPath: string
  shortcut?: string
  shouldProcess?: () => boolean
  log?: (message: string, extra?: Record<string, unknown>) => void
}

export function createHotkeyManager(options: CreateHotkeyManagerOptions): HotkeyManager {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return new NativeHotkeyManager({
      resourcesPath: options.resourcesPath,
      shortcut: options.shortcut,
      shouldProcess: options.shouldProcess,
      log: options.log,
    })
  }

  return new StubHotkeyManager()
}

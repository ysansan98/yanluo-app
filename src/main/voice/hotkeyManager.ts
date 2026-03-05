import type { HotkeyManager } from './types'
import {
  formatHotkeyShortcut,
  parseHotkeyShortcut,
} from '../keyboard/hotkeyMatcher'
import { StubHotkeyManager } from '../keyboard/stubHotkeyManager'

export interface HotkeyConfig {
  modifiers: string[]
  key: string
  enabled: boolean
}

function flattenModifiers(modifierGroups: string[][]): string[] {
  return modifierGroups.flat()
}

export function parseShortcut(shortcut: string | null | undefined): HotkeyConfig {
  const parsed = parseHotkeyShortcut(shortcut)
  return {
    modifiers: flattenModifiers(parsed.modifierGroups),
    key: parsed.primaryKey ?? '',
    enabled: parsed.enabled,
  }
}

export function formatShortcut(config: HotkeyConfig): string {
  return formatHotkeyShortcut({
    modifierGroups: config.modifiers.map(m => [m]),
    primaryKey: config.key || null,
    enabled: config.enabled,
  })
}

// Deprecated: keep this export to avoid breaking imports during migration.
export class MacGlobalHotkeyManager extends StubHotkeyManager implements HotkeyManager {}

export { StubHotkeyManager }

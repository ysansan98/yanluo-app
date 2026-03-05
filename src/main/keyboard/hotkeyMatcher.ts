import type { HotkeyDefinition, HotkeyPressedSnapshot } from './types'

const MODIFIER_ALIASES: Record<string, string[]> = {
  CTRL: ['LEFTCTRL', 'RIGHTCTRL', 'CTRL'],
  ALT: ['LEFTALT', 'RIGHTALT', 'ALT', 'OPTION'],
  OPTION: ['LEFTALT', 'RIGHTALT', 'ALT', 'OPTION'],
  SHIFT: ['LEFTSHIFT', 'RIGHTSHIFT', 'SHIFT'],
  CMD: ['LEFTMETA', 'RIGHTMETA', 'META', 'CMD', 'COMMAND', 'WIN'],
  COMMAND: ['LEFTMETA', 'RIGHTMETA', 'META', 'CMD', 'COMMAND', 'WIN'],
  META: ['LEFTMETA', 'RIGHTMETA', 'META', 'CMD', 'COMMAND', 'WIN'],
  WIN: ['LEFTMETA', 'RIGHTMETA', 'META', 'CMD', 'COMMAND', 'WIN'],
}

const KEY_ALIASES: Record<string, string> = {
  SPACE: 'SPACE',
  ENTER: 'ENTER',
  RETURN: 'ENTER',
  TAB: 'TAB',
  ESC: 'ESCAPE',
  ESCAPE: 'ESCAPE',
  ARROWUP: 'UP',
  ARROWDOWN: 'DOWN',
  ARROWLEFT: 'LEFT',
  ARROWRIGHT: 'RIGHT',
}

const DEFAULT_SHORTCUT = 'Ctrl + Z'

function normalize(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/_/g, '').replace(/-/g, '').toUpperCase()
}

export function parseHotkeyShortcut(shortcut: string | null | undefined): HotkeyDefinition {
  if (shortcut === '') {
    return { modifierGroups: [], primaryKey: null, enabled: false }
  }

  const value = typeof shortcut === 'string' && shortcut.trim().length > 0
    ? shortcut
    : DEFAULT_SHORTCUT

  const parts = value
    .split('+')
    .map(part => part.trim())
    .filter(Boolean)

  const modifierGroups: string[][] = []
  let primaryKey: string | null = null

  for (const part of parts) {
    const token = normalize(part)
    if (MODIFIER_ALIASES[token]) {
      modifierGroups.push(MODIFIER_ALIASES[token])
      continue
    }

    primaryKey = KEY_ALIASES[token] ?? token
  }

  if (modifierGroups.length === 0 && !primaryKey) {
    return {
      modifierGroups: [MODIFIER_ALIASES.CTRL],
      primaryKey: 'Z',
      enabled: true,
    }
  }

  if (modifierGroups.length === 0 && primaryKey) {
    modifierGroups.push(MODIFIER_ALIASES.CTRL)
  }

  return {
    modifierGroups,
    primaryKey,
    enabled: true,
  }
}

export function formatHotkeyShortcut(definition: HotkeyDefinition): string {
  if (!definition.enabled)
    return ''

  const names: string[] = []
  const flat = definition.modifierGroups.flat()

  if (flat.some(name => name.includes('META') || name === 'CMD' || name === 'COMMAND'))
    names.push('Cmd')
  if (flat.some(name => name.includes('CTRL')))
    names.push('Ctrl')
  if (flat.some(name => name.includes('ALT') || name === 'OPTION'))
    names.push('Alt')
  if (flat.some(name => name.includes('SHIFT')))
    names.push('Shift')

  if (definition.primaryKey)
    names.push(definition.primaryKey.length === 1 ? definition.primaryKey.toUpperCase() : definition.primaryKey)

  return names.join(' + ')
}

export function isHotkeyMatched(
  definition: HotkeyDefinition,
  snapshot: HotkeyPressedSnapshot,
): boolean {
  if (!definition.enabled)
    return false

  const pressed = new Set(snapshot.names.map(normalize))

  const allModifiersPressed = definition.modifierGroups.every((group) => {
    return group.some(name => pressed.has(normalize(name)))
  })

  if (!allModifiersPressed)
    return false

  if (!definition.primaryKey)
    return true

  const target = normalize(definition.primaryKey)
  return pressed.has(target)
}

import { describe, expect, it } from 'vitest'
import {
  formatHotkeyShortcut,
  isHotkeyMatched,
  parseHotkeyShortcut,
} from '../../src/main/keyboard/hotkeyMatcher'

describe('keyboard/hotkeyMatcher', () => {
  it('parses disabled shortcut', () => {
    const def = parseHotkeyShortcut('')
    expect(def.enabled).toBe(false)
    expect(def.primaryKey).toBe(null)
  })

  it('parses common combo and formats it', () => {
    const def = parseHotkeyShortcut('Ctrl + Shift + K')
    expect(def.enabled).toBe(true)
    expect(def.primaryKey).toBe('K')
    expect(formatHotkeyShortcut(def)).toBe('Ctrl + Shift + K')
  })

  it('matches pressed keys by alias', () => {
    const def = parseHotkeyShortcut('Option + Space')
    const matched = isHotkeyMatched(def, {
      names: ['LEFTALT', 'SPACE'],
      primaryKey: 'SPACE',
    })
    expect(matched).toBe(true)
  })
})

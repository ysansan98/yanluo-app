import type { NativeKeyboardBridge } from '../../src/main/keyboard/types'
import { describe, expect, it, vi } from 'vitest'
import { NativeHotkeyManager } from '../../src/main/keyboard/nativeHotkeyManager'

function createFakeBridge() {
  let callback: ((event: any) => void) | null = null

  const bridge: NativeKeyboardBridge = {
    start: vi.fn((cb) => {
      callback = cb
      return true
    }),
    stop: vi.fn(),
    setHotkeys: vi.fn(),
    resetPressed: vi.fn(),
    setPollIntervalMs: vi.fn(),
  }

  return {
    bridge,
    emit: (event: any) => callback?.(event),
  }
}

describe('keyboard/nativeHotkeyManager', () => {
  it('emits press and release for configured shortcut', async () => {
    const fake = createFakeBridge()
    const onPress = vi.fn()
    const onRelease = vi.fn()

    const manager = new NativeHotkeyManager({
      resourcesPath: '/tmp/resources',
      shortcut: 'Ctrl + Z',
      bridge: fake.bridge,
    })

    manager.onPress(onPress)
    manager.onRelease(onRelease)

    await manager.start()

    fake.emit({ code: 59, name: 'LEFTCTRL', type: 'down', timestamp: Date.now(), source: 'physical' })
    fake.emit({ code: 6, name: 'Z', type: 'down', timestamp: Date.now(), source: 'physical' })
    expect(onPress).toHaveBeenCalledTimes(1)

    fake.emit({ code: 6, name: 'Z', type: 'up', timestamp: Date.now(), source: 'physical' })
    expect(onRelease).toHaveBeenCalledTimes(1)
  })

  it('updates bridge hotkeys on shortcut update', () => {
    const fake = createFakeBridge()
    const manager = new NativeHotkeyManager({
      resourcesPath: '/tmp/resources',
      shortcut: 'Ctrl + Z',
      bridge: fake.bridge,
    })

    manager.updateShortcut('Alt + Space')

    expect(fake.bridge.setHotkeys).toHaveBeenCalled()
  })
})

import type {
  IGlobalKeyDownMap,
  IGlobalKeyEvent,
  IGlobalKeyListener,
} from 'node-global-key-listener'
import type { HotkeyManager, VoiceError } from './types'
import { GlobalKeyboardListener } from 'node-global-key-listener'

/**
 * 快捷键配置结构
 */
export interface HotkeyConfig {
  modifiers: string[] // 修饰键列表，如 ['LEFT ALT', 'RIGHT ALT']
  key: string // 主键，如 'SPACE', 'Z', 'F1' 等
  enabled: boolean // 是否启用快捷键（false 表示已清空/禁用）
}

interface HotkeyManagerOptions {
  shortcut?: string // 快捷键配置字符串，如 "Alt + Space"
  log?: (message: string, extra?: Record<string, unknown>) => void
  shouldProcess?: () => boolean
}

// node-global-key-listener 的修饰键映射
// 每个前端显示的键名对应可能的底层键名数组
const MODIFIER_KEY_MAP: Record<string, string[]> = {
  Ctrl: ['LEFT CTRL', 'RIGHT CTRL'],
  Alt: ['LEFT ALT', 'RIGHT ALT'], // Mac 上的 Option 键
  Option: ['LEFT ALT', 'RIGHT ALT'], // Mac 专用名称
  Shift: ['LEFT SHIFT', 'RIGHT SHIFT'],
  Cmd: ['LEFT META', 'RIGHT META'], // Mac Command
  Command: ['LEFT META', 'RIGHT META'],
  Meta: ['LEFT META', 'RIGHT META'],
  Win: ['LEFT META', 'RIGHT META'], // Windows
}

// 特殊键名映射（前端显示名称 -> node-global-key-listener 名称）
const KEY_NAME_MAP: Record<string, string> = {
  'Space': 'SPACE',
  ' ': 'SPACE',
  'Enter': '↵',
  'Return': '↵',
  'Tab': 'TAB',
  'Esc': 'ESCAPE',
  'Escape': 'ESCAPE',
  '↑': 'UP ARROW',
  '↓': 'DOWN ARROW',
  '←': 'LEFT ARROW',
  '→': 'RIGHT ARROW',
  'Up': 'UP ARROW',
  'Down': 'DOWN ARROW',
  'Left': 'LEFT ARROW',
  'Right': 'RIGHT ARROW',
  'ArrowUp': 'UP ARROW',
  'ArrowDown': 'DOWN ARROW',
  'ArrowLeft': 'LEFT ARROW',
  'ArrowRight': 'RIGHT ARROW',
  'Delete': 'DELETE',
  'Backspace': 'BACKSPACE',
  'Home': 'HOME',
  'End': 'END',
  'PageUp': 'PAGE UP',
  'PageDown': 'PAGE DOWN',
  'PgUp': 'PAGE UP',
  'PgDn': 'PAGE DOWN',
  'Insert': 'INSERT',
  'Ins': 'INSERT',
}

// 默认快捷键
const DEFAULT_SHORTCUT = 'Ctrl + Z'

/**
 * 解析快捷键字符串为配置对象
 * 支持格式："Ctrl + Z", "Alt + Space", "Ctrl + Shift + A" 等
 */
export function parseShortcut(shortcut: string | null | undefined): HotkeyConfig {
  // 空字符串表示清空/禁用快捷键
  if (shortcut === '') {
    return { modifiers: [], key: '', enabled: false }
  }

  if (!shortcut || typeof shortcut !== 'string') {
    shortcut = DEFAULT_SHORTCUT
  }

  const parts = shortcut.split(/\s*\+\s*/).map(p => p.trim())
  const modifiers: string[] = []
  let key = ''

  for (const part of parts) {
    const upperPart = part
    // 检查是否是修饰键
    if (MODIFIER_KEY_MAP[upperPart]) {
      modifiers.push(...MODIFIER_KEY_MAP[upperPart])
    }
    else {
      // 这是一个普通键
      key = KEY_NAME_MAP[upperPart] || upperPart.toUpperCase()
    }
  }

  // 如果没有指定修饰键且没有主键，默认使用 Ctrl + Z
  if (modifiers.length === 0 && !key) {
    modifiers.push(...MODIFIER_KEY_MAP.Ctrl)
    key = 'Z'
  }
  // 如果只有主键没有修饰键，默认添加 Ctrl
  else if (modifiers.length === 0 && key) {
    modifiers.push(...MODIFIER_KEY_MAP.Ctrl)
  }
  // 如果只有修饰键没有主键，允许（纯修饰键组合）

  return { modifiers, key, enabled: true }
}

/**
 * 将快捷键配置格式化为显示字符串
 */
export function formatShortcut(config: HotkeyConfig): string {
  if (!config.enabled) {
    return ''
  }

  const modifierNames: string[] = []

  // 去重并简化显示
  const hasCtrl = config.modifiers.some(m => m.includes('CTRL'))
  const hasAlt = config.modifiers.some(m => m.includes('ALT'))
  const hasShift = config.modifiers.some(m => m.includes('SHIFT'))
  const hasMeta = config.modifiers.some(m => m.includes('META'))

  if (hasMeta)
    modifierNames.push('Cmd')
  if (hasCtrl)
    modifierNames.push('Ctrl')
  if (hasAlt)
    modifierNames.push('Alt')
  if (hasShift)
    modifierNames.push('Shift')

  // 格式化主键显示
  let keyDisplay = config.key
  const reverseKeyMap: Record<string, string> = {
    'SPACE': 'Space',
    'RETURN': 'Enter',
    'ESCAPE': 'Esc',
    'UP ARROW': '↑',
    'DOWN ARROW': '↓',
    'LEFT ARROW': '←',
    'RIGHT ARROW': '→',
    'TAB': 'Tab',
    'DELETE': 'Delete',
    'BACKSPACE': 'Backspace',
  }

  if (config.key) {
    if (reverseKeyMap[config.key]) {
      keyDisplay = reverseKeyMap[config.key]
    }
    else if (config.key.length === 1) {
      keyDisplay = config.key.toUpperCase()
    }
    modifierNames.push(keyDisplay)
  }

  return modifierNames.join(' + ')
}

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

  private config: HotkeyConfig
  private readonly log: (
    message: string,
    extra?: Record<string, unknown>,
  ) => void

  private readonly shouldProcess: () => boolean
  private readonly listener: IGlobalKeyListener

  private started = false
  private hotkeyPressed = false
  private pressHandler: (() => void) | null = null
  private releaseHandler: (() => void) | null = null
  private errorHandler: ((err: VoiceError) => void) | null = null

  constructor(options: HotkeyManagerOptions = {}) {
    this.config = parseShortcut(options.shortcut)
    this.log
      = options.log
        ?? ((message, extra) => console.info(`[hotkey] ${message}`, extra ?? {}))
    this.shouldProcess = () => options?.shouldProcess?.() ?? true
    this.listener = (event, isDown) => this.handleEvent(event, isDown)
  }

  /**
   * 热更新快捷键配置
   */
  updateShortcut(shortcut: string): void {
    const oldShortcut = formatShortcut(this.config)
    this.config = parseShortcut(shortcut)
    this.log('shortcut updated', {
      from: oldShortcut,
      to: formatShortcut(this.config),
      modifiers: this.config.modifiers,
      key: this.config.key,
    })
  }

  async start(): Promise<void> {
    if (this.started)
      return

    try {
      await this.keyboard.addListener(this.listener)
      this.started = true
      this.log('registered global key listener', {
        shortcut: formatShortcut(this.config),
        modifiers: this.config.modifiers,
        key: this.config.key,
      })
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
    this.log('unregistered global key listener', {
      shortcut: formatShortcut(this.config),
    })
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
    // 首先检查是否应该处理此事件（用于 onboarding 设置快捷键时临时禁用）
    if (!this.shouldProcess()) {
      return
    }

    // 如果快捷键被禁用，不处理任何事件
    if (!this.config.enabled) {
      return
    }

    // 检查修饰键是否按下（按类型分组，每类只要有一个按下即可）
    const hasCtrl = this.config.modifiers.some(k => k.includes('CTRL') && isDown[k])
    const hasAlt = this.config.modifiers.some(k => k.includes('ALT') && isDown[k])
    const hasShift = this.config.modifiers.some(k => k.includes('SHIFT') && isDown[k])
    const hasMeta = this.config.modifiers.some(k => k.includes('META') && isDown[k])

    // 根据配置中实际有的修饰键类型检查
    const needCtrl = this.config.modifiers.some(k => k.includes('CTRL'))
    const needAlt = this.config.modifiers.some(k => k.includes('ALT'))
    const needShift = this.config.modifiers.some(k => k.includes('SHIFT'))
    const needMeta = this.config.modifiers.some(k => k.includes('META'))

    const allModifiersDown = (!needCtrl || hasCtrl)
      && (!needAlt || hasAlt)
      && (!needShift || hasShift)
      && (!needMeta || hasMeta)

    // 检查主键是否按下（如果有配置主键）
    const hasTarget = this.config.key ? Boolean(isDown[this.config.key]) : true
    // 组合键状态
    const comboDown = allModifiersDown && hasTarget

    if (comboDown && !this.hotkeyPressed && event.state === 'DOWN') {
      this.hotkeyPressed = true
      this.log('press', { key: event.name, state: event.state, shortcut: formatShortcut(this.config) })
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

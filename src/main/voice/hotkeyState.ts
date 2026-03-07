import { createLogger } from '../logging'

const log = createLogger('voice-hotkey-state')

// 全局热键状态管理
let hotkeyDisabledGlobally = false

export function setHotkeyDisabledGlobally(disabled: boolean): void {
  hotkeyDisabledGlobally = disabled
  log.info('hotkey global disabled flag updated', { disabled })
}

export function isHotkeyDisabledGlobally(): boolean {
  return hotkeyDisabledGlobally
}

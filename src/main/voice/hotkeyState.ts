// 全局热键状态管理
let hotkeyDisabledGlobally = false

export function setHotkeyDisabledGlobally(disabled: boolean): void {
  hotkeyDisabledGlobally = disabled
  console.log('[HOTKEY_STATE] disabled:', disabled)
}

export function isHotkeyDisabledGlobally(): boolean {
  return hotkeyDisabledGlobally
}

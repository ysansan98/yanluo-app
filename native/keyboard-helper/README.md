# keyboard-helper

跨平台全局键盘监听原生库骨架（低侵权风险自研版）。

## 导出 ABI

见 `include/keyboard_helper.h`：

- `keyboardStart(callback)`
- `keyboardStop()`
- `keyboardSetHotkeys(json)`
- `keyboardResetPressed()`
- `keyboardSetPollIntervalMs(ms)`

## 构建

### macOS

```bash
cmake -S native/keyboard-helper -B native/keyboard-helper/build-mac
cmake --build native/keyboard-helper/build-mac --config Release
cp native/keyboard-helper/build-mac/libKeyboardHelper.dylib resources/lib/keyboard-helper/build/libKeyboardHelper.dylib
```

### Windows (PowerShell)

```powershell
cmake -S native/keyboard-helper -B native/keyboard-helper/build-win -A x64
cmake --build native/keyboard-helper/build-win --config Release
Copy-Item native/keyboard-helper/build-win/Release/KeyboardHelper.dll resources/lib/keyboard-helper/build/KeyboardHelper.dll
```

## 实现计划

- macOS: `CGEventTapCreate + CFRunLoop`
- Windows: `SetWindowsHookExW(WH_KEYBOARD_LL) + GetMessage`
- JS 层桥接：`src/main/keyboard/nativeBridge.ts`

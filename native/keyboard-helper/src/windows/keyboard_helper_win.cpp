#include "keyboard_helper.h"

#include <windows.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cctype>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace {

struct KeyboardRuntime {
  std::mutex mutex;
  std::condition_variable cv;

  std::thread worker;
  KeyboardEventCallback callback = nullptr;

  HHOOK hook = nullptr;
  DWORD threadId = 0;

  std::unordered_set<int32_t> pressedCodes;
  std::unordered_set<int32_t> trackedCodes;

  std::atomic<bool> running = false;
  bool initDone = false;
  bool initSuccess = false;

  int32_t pollIntervalMs = 5;
  std::string hotkeysJson;
};

KeyboardRuntime g_runtime;

int64_t nowMs() {
  const auto now = std::chrono::time_point_cast<std::chrono::milliseconds>(
    std::chrono::system_clock::now());
  return now.time_since_epoch().count();
}

std::string normalizeToken(const std::string& input) {
  std::string output;
  output.reserve(input.size());
  for (const unsigned char ch : input) {
    if (ch == ' ' || ch == '_' || ch == '-') {
      continue;
    }
    output.push_back(static_cast<char>(std::toupper(ch)));
  }
  return output;
}

const std::unordered_map<uint32_t, std::string> kVkNames = {
  {VK_SHIFT, "SHIFT"}, {VK_LSHIFT, "LEFTSHIFT"}, {VK_RSHIFT, "RIGHTSHIFT"},
  {VK_CONTROL, "CTRL"}, {VK_LCONTROL, "LEFTCTRL"}, {VK_RCONTROL, "RIGHTCTRL"},
  {VK_MENU, "ALT"}, {VK_LMENU, "LEFTALT"}, {VK_RMENU, "RIGHTALT"},
  {VK_LWIN, "LEFTMETA"}, {VK_RWIN, "RIGHTMETA"}, {VK_SPACE, "SPACE"},
  {VK_RETURN, "ENTER"}, {VK_ESCAPE, "ESCAPE"}, {VK_TAB, "TAB"},
  {VK_BACK, "BACKSPACE"}, {VK_DELETE, "DELETE"}, {VK_UP, "UP"},
  {VK_DOWN, "DOWN"}, {VK_LEFT, "LEFT"}, {VK_RIGHT, "RIGHT"},
  {VK_HOME, "HOME"}, {VK_END, "END"}, {VK_PRIOR, "PAGEUP"},
  {VK_NEXT, "PAGEDOWN"}, {VK_CAPITAL, "CAPSLOCK"},
  {VK_F1, "F1"}, {VK_F2, "F2"}, {VK_F3, "F3"}, {VK_F4, "F4"},
  {VK_F5, "F5"}, {VK_F6, "F6"}, {VK_F7, "F7"}, {VK_F8, "F8"},
  {VK_F9, "F9"}, {VK_F10, "F10"}, {VK_F11, "F11"}, {VK_F12, "F12"},
};

std::unordered_map<std::string, std::vector<int32_t>> buildNameToCodes() {
  std::unordered_map<std::string, std::vector<int32_t>> table;
  for (const auto& item : kVkNames) {
    table[normalizeToken(item.second)].push_back(static_cast<int32_t>(item.first));
  }

  table["CTRL"] = {VK_LCONTROL, VK_RCONTROL};
  table["LEFTCTRL"] = {VK_LCONTROL, VK_RCONTROL};
  table["RIGHTCTRL"] = {VK_LCONTROL, VK_RCONTROL};

  table["ALT"] = {VK_LMENU, VK_RMENU};
  table["OPTION"] = {VK_LMENU, VK_RMENU};
  table["LEFTALT"] = {VK_LMENU, VK_RMENU};
  table["RIGHTALT"] = {VK_LMENU, VK_RMENU};

  table["SHIFT"] = {VK_LSHIFT, VK_RSHIFT};
  table["LEFTSHIFT"] = {VK_LSHIFT, VK_RSHIFT};
  table["RIGHTSHIFT"] = {VK_LSHIFT, VK_RSHIFT};

  table["META"] = {VK_LWIN, VK_RWIN};
  table["CMD"] = {VK_LWIN, VK_RWIN};
  table["COMMAND"] = {VK_LWIN, VK_RWIN};
  table["WIN"] = {VK_LWIN, VK_RWIN};
  table["LEFTMETA"] = {VK_LWIN, VK_RWIN};
  table["RIGHTMETA"] = {VK_LWIN, VK_RWIN};

  for (int32_t vk = 0x30; vk <= 0x39; ++vk) {
    char digit[2] = {static_cast<char>(vk), '\0'};
    table[digit] = {vk};
  }

  for (int32_t vk = 0x41; vk <= 0x5A; ++vk) {
    char letter[2] = {static_cast<char>(vk), '\0'};
    table[letter] = {vk};
  }

  return table;
}

const std::unordered_map<std::string, std::vector<int32_t>> kNameToCodes = buildNameToCodes();

std::vector<std::string> extractQuotedTokens(const std::string& json) {
  std::vector<std::string> tokens;
  bool inQuote = false;
  std::string current;

  for (size_t i = 0; i < json.size(); ++i) {
    const char ch = json[i];
    if (ch == '\\' && inQuote && i + 1 < json.size()) {
      current.push_back(json[++i]);
      continue;
    }

    if (ch == '"') {
      if (inQuote) {
        tokens.push_back(current);
        current.clear();
      }
      inQuote = !inQuote;
      continue;
    }

    if (inQuote) {
      current.push_back(ch);
    }
  }

  return tokens;
}

void applyHotkeysJsonLocked(const std::string& json) {
  g_runtime.trackedCodes.clear();
  g_runtime.hotkeysJson = json;

  const std::vector<std::string> tokens = extractQuotedTokens(json);
  for (const auto& token : tokens) {
    const std::string normalized = normalizeToken(token);
    const auto it = kNameToCodes.find(normalized);
    if (it == kNameToCodes.end()) {
      continue;
    }

    for (const int32_t code : it->second) {
      g_runtime.trackedCodes.insert(code);
    }
  }

  for (auto it = g_runtime.pressedCodes.begin(); it != g_runtime.pressedCodes.end();) {
    if (g_runtime.trackedCodes.find(*it) == g_runtime.trackedCodes.end()) {
      it = g_runtime.pressedCodes.erase(it);
    } else {
      ++it;
    }
  }
}

bool shouldForwardKeyCode(int32_t keyCode) {
  std::lock_guard<std::mutex> lock(g_runtime.mutex);
  return g_runtime.trackedCodes.find(keyCode) != g_runtime.trackedCodes.end();
}

const char* keyNameForVk(uint32_t vkCode) {
  const auto it = kVkNames.find(vkCode);
  if (it != kVkNames.end()) {
    return it->second.c_str();
  }

  if (vkCode >= 0x41 && vkCode <= 0x5A) {
    thread_local std::string alpha;
    alpha.assign(1, static_cast<char>(vkCode));
    return alpha.c_str();
  }

  if (vkCode >= 0x30 && vkCode <= 0x39) {
    thread_local std::string digit;
    digit.assign(1, static_cast<char>(vkCode));
    return digit.c_str();
  }

  thread_local std::string fallback;
  fallback = "VK_" + std::to_string(vkCode);
  return fallback.c_str();
}

void emitEvent(int32_t keyCode, int32_t eventType, int32_t sourceType, bool updatePressed) {
  KeyboardEventCallback callback = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_runtime.mutex);
    callback = g_runtime.callback;
    if (updatePressed) {
      if (eventType == 1) {
        g_runtime.pressedCodes.insert(keyCode);
      } else {
        g_runtime.pressedCodes.erase(keyCode);
      }
    }
  }

  if (!callback) {
    return;
  }

  callback(keyCode, keyNameForVk(static_cast<uint32_t>(keyCode)), eventType, nowMs(), sourceType);
}

LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
  if (nCode != HC_ACTION || lParam == 0) {
    return CallNextHookEx(nullptr, nCode, wParam, lParam);
  }

  if (!g_runtime.running.load()) {
    return CallNextHookEx(nullptr, nCode, wParam, lParam);
  }

  const auto* data = reinterpret_cast<const KBDLLHOOKSTRUCT*>(lParam);
  if (!data) {
    return CallNextHookEx(nullptr, nCode, wParam, lParam);
  }

  const int32_t keyCode = static_cast<int32_t>(data->vkCode);
  if (!shouldForwardKeyCode(keyCode)) {
    return CallNextHookEx(nullptr, nCode, wParam, lParam);
  }

  const bool isSynthetic = (data->flags & LLKHF_INJECTED) != 0;
  const int32_t sourceType = isSynthetic ? 1 : 0;

  switch (wParam) {
    case WM_KEYDOWN:
    case WM_SYSKEYDOWN:
      emitEvent(keyCode, 1, sourceType, true);
      break;
    case WM_KEYUP:
    case WM_SYSKEYUP:
      emitEvent(keyCode, 0, sourceType, true);
      break;
    default:
      break;
  }

  return CallNextHookEx(nullptr, nCode, wParam, lParam);
}

void runHookLoop() {
  DWORD threadId = GetCurrentThreadId();

  HHOOK hook = SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc, GetModuleHandleW(nullptr), 0);

  {
    std::lock_guard<std::mutex> lock(g_runtime.mutex);
    g_runtime.threadId = threadId;
    g_runtime.hook = hook;
    g_runtime.initDone = true;
    g_runtime.initSuccess = (hook != nullptr);
    g_runtime.cv.notify_all();
  }

  if (!hook) {
    g_runtime.running.store(false);
    return;
  }

  MSG msg;
  while (g_runtime.running.load()) {
    const BOOL result = GetMessageW(&msg, nullptr, 0, 0);
    if (result <= 0) {
      break;
    }
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }

  UnhookWindowsHookEx(hook);

  std::lock_guard<std::mutex> lock(g_runtime.mutex);
  g_runtime.hook = nullptr;
  g_runtime.threadId = 0;
  g_runtime.pressedCodes.clear();
}

} // namespace

extern "C" int32_t keyboardStart(KeyboardEventCallback callback) {
  if (callback == nullptr) {
    return 0;
  }

  std::unique_lock<std::mutex> lock(g_runtime.mutex);

  if (g_runtime.running.load()) {
    g_runtime.callback = callback;
    return 1;
  }

  g_runtime.callback = callback;
  g_runtime.initDone = false;
  g_runtime.initSuccess = false;
  g_runtime.running.store(true);

  g_runtime.worker = std::thread(runHookLoop);

  g_runtime.cv.wait(lock, []() {
    return g_runtime.initDone;
  });

  if (!g_runtime.initSuccess) {
    g_runtime.running.store(false);
    lock.unlock();
    if (g_runtime.worker.joinable()) {
      g_runtime.worker.join();
    }
    return 0;
  }

  return 1;
}

extern "C" void keyboardStop(void) {
  DWORD threadId = 0;
  {
    std::lock_guard<std::mutex> lock(g_runtime.mutex);
    if (!g_runtime.running.load()) {
      g_runtime.callback = nullptr;
      return;
    }

    g_runtime.running.store(false);
    g_runtime.callback = nullptr;
    threadId = g_runtime.threadId;
  }

  if (threadId != 0) {
    PostThreadMessageW(threadId, WM_QUIT, 0, 0);
  }

  if (g_runtime.worker.joinable()) {
    g_runtime.worker.join();
  }
}

extern "C" void keyboardSetHotkeys(const char* json_hotkeys) {
  std::lock_guard<std::mutex> lock(g_runtime.mutex);
  applyHotkeysJsonLocked(json_hotkeys != nullptr ? json_hotkeys : "");
}

extern "C" void keyboardResetPressed(void) {
  std::lock_guard<std::mutex> lock(g_runtime.mutex);
  g_runtime.pressedCodes.clear();
}

extern "C" void keyboardSetPollIntervalMs(int32_t interval_ms) {
  if (interval_ms <= 0) {
    return;
  }

  std::lock_guard<std::mutex> lock(g_runtime.mutex);
  g_runtime.pollIntervalMs = interval_ms;
}

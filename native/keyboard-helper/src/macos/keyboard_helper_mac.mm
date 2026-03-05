#include "keyboard_helper.h"

#include <ApplicationServices/ApplicationServices.h>

#include <algorithm>
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

  CFMachPortRef eventTap = nullptr;
  CFRunLoopSourceRef runLoopSource = nullptr;
  CFRunLoopRef runLoop = nullptr;

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

const std::unordered_map<int32_t, std::string> kKeyNames = {
  {0, "A"}, {1, "S"}, {2, "D"}, {3, "F"}, {4, "H"}, {5, "G"},
  {6, "Z"}, {7, "X"}, {8, "C"}, {9, "V"}, {11, "B"}, {12, "Q"},
  {13, "W"}, {14, "E"}, {15, "R"}, {16, "Y"}, {17, "T"}, {18, "1"},
  {19, "2"}, {20, "3"}, {21, "4"}, {22, "6"}, {23, "5"}, {24, "="},
  {25, "9"}, {26, "7"}, {27, "-"}, {28, "8"}, {29, "0"}, {30, "]"},
  {31, "O"}, {32, "U"}, {33, "["}, {34, "I"}, {35, "P"}, {36, "ENTER"},
  {37, "L"}, {38, "J"}, {39, "'"}, {40, "K"}, {41, ";"}, {42, "\\"},
  {43, ","}, {44, "/"}, {45, "N"}, {46, "M"}, {47, "."}, {48, "TAB"},
  {49, "SPACE"}, {50, "`"}, {51, "BACKSPACE"}, {53, "ESCAPE"},
  {54, "RIGHTMETA"}, {55, "LEFTMETA"}, {56, "LEFTSHIFT"}, {57, "CAPSLOCK"},
  {58, "LEFTALT"}, {59, "LEFTCTRL"}, {60, "RIGHTSHIFT"}, {61, "RIGHTALT"},
  {62, "RIGHTCTRL"}, {63, "FN"}, {64, "F17"}, {65, "NUMPADDECIMAL"},
  {67, "NUMPADMULTIPLY"}, {69, "NUMPADADD"}, {71, "NUMPADCLEAR"},
  {75, "NUMPADDIVIDE"}, {76, "NUMPADENTER"}, {78, "NUMPADSUBTRACT"},
  {81, "NUMPADEQUALS"}, {82, "NUMPAD0"}, {83, "NUMPAD1"}, {84, "NUMPAD2"},
  {85, "NUMPAD3"}, {86, "NUMPAD4"}, {87, "NUMPAD5"}, {88, "NUMPAD6"},
  {89, "NUMPAD7"}, {91, "NUMPAD8"}, {92, "NUMPAD9"}, {96, "F5"},
  {97, "F6"}, {98, "F7"}, {99, "F3"}, {100, "F8"}, {101, "F9"},
  {103, "F11"}, {105, "F13"}, {106, "F16"}, {107, "F14"}, {109, "F10"},
  {111, "F12"}, {113, "F15"}, {114, "HELP"}, {115, "HOME"},
  {116, "PAGEUP"}, {117, "DELETE"}, {118, "F4"}, {119, "END"},
  {120, "F2"}, {121, "PAGEDOWN"}, {122, "F1"}, {123, "LEFT"},
  {124, "RIGHT"}, {125, "DOWN"}, {126, "UP"},
};

std::unordered_map<std::string, std::vector<int32_t>> buildNameToCodes() {
  std::unordered_map<std::string, std::vector<int32_t>> table;
  for (const auto& item : kKeyNames) {
    table[normalizeToken(item.second)].push_back(item.first);
  }

  table["CTRL"] = {59, 62};
  table["LEFTCTRL"] = {59, 62};
  table["RIGHTCTRL"] = {59, 62};

  table["ALT"] = {58, 61};
  table["OPTION"] = {58, 61};
  table["LEFTALT"] = {58, 61};
  table["RIGHTALT"] = {58, 61};

  table["SHIFT"] = {56, 60};
  table["LEFTSHIFT"] = {56, 60};
  table["RIGHTSHIFT"] = {56, 60};

  table["META"] = {54, 55};
  table["CMD"] = {54, 55};
  table["COMMAND"] = {54, 55};
  table["WIN"] = {54, 55};
  table["LEFTMETA"] = {54, 55};
  table["RIGHTMETA"] = {54, 55};

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

const char* keyNameForCode(int32_t keyCode) {
  const auto it = kKeyNames.find(keyCode);
  if (it != kKeyNames.end()) {
    return it->second.c_str();
  }

  thread_local std::string fallback;
  fallback = "KEY_" + std::to_string(keyCode);
  return fallback.c_str();
}

CGEventFlags modifierFlagForKeyCode(int32_t keyCode) {
  switch (keyCode) {
    case 55:
    case 54:
      return kCGEventFlagMaskCommand;
    case 56:
    case 60:
      return kCGEventFlagMaskShift;
    case 58:
    case 61:
      return kCGEventFlagMaskAlternate;
    case 59:
    case 62:
      return kCGEventFlagMaskControl;
    case 63:
      return kCGEventFlagMaskSecondaryFn;
    default:
      return 0;
  }
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

  callback(keyCode, keyNameForCode(keyCode), eventType, nowMs(), sourceType);
}

CGEventRef tapCallback(CGEventTapProxy,
                       CGEventType type,
                       CGEventRef event,
                       void* userData) {
  (void)userData;

  if (!g_runtime.running.load()) {
    return event;
  }

  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    if (g_runtime.eventTap != nullptr) {
      CGEventTapEnable(g_runtime.eventTap, true);
    }
    return event;
  }

  if (type != kCGEventKeyDown && type != kCGEventKeyUp && type != kCGEventFlagsChanged) {
    return event;
  }

  const int32_t keyCode = static_cast<int32_t>(
    CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode));

  if (!shouldForwardKeyCode(keyCode)) {
    return event;
  }

  if (type == kCGEventKeyDown) {
    emitEvent(keyCode, 1, 0, true);
    return event;
  }

  if (type == kCGEventKeyUp) {
    emitEvent(keyCode, 0, 0, true);
    return event;
  }

  const CGEventFlags flag = modifierFlagForKeyCode(keyCode);
  if (flag == 0) {
    return event;
  }

  const CGEventFlags flags = CGEventGetFlags(event);
  const bool isDown = (flags & flag) != 0;
  emitEvent(keyCode, isDown ? 1 : 0, 0, true);
  return event;
}

void runEventLoop() {
  CGEventMask mask = (1ULL << kCGEventKeyDown)
    | (1ULL << kCGEventKeyUp)
    | (1ULL << kCGEventFlagsChanged);

  CFMachPortRef tap = CGEventTapCreate(kCGSessionEventTap,
                                       kCGHeadInsertEventTap,
                                       kCGEventTapOptionListenOnly,
                                       mask,
                                       tapCallback,
                                       nullptr);

  {
    std::lock_guard<std::mutex> lock(g_runtime.mutex);
    g_runtime.eventTap = tap;

    if (!tap) {
      g_runtime.initDone = true;
      g_runtime.initSuccess = false;
      g_runtime.cv.notify_all();
      g_runtime.running.store(false);
      return;
    }

    g_runtime.runLoopSource = CFMachPortCreateRunLoopSource(
      kCFAllocatorDefault,
      tap,
      0);

    if (!g_runtime.runLoopSource) {
      CFRelease(tap);
      g_runtime.eventTap = nullptr;
      g_runtime.initDone = true;
      g_runtime.initSuccess = false;
      g_runtime.cv.notify_all();
      g_runtime.running.store(false);
      return;
    }

    g_runtime.runLoop = CFRunLoopGetCurrent();
    CFRetain(g_runtime.runLoop);
    CFRunLoopAddSource(g_runtime.runLoop, g_runtime.runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(tap, true);

    g_runtime.initDone = true;
    g_runtime.initSuccess = true;
    g_runtime.cv.notify_all();
  }

  CFRunLoopRun();

  std::lock_guard<std::mutex> lock(g_runtime.mutex);
  if (g_runtime.runLoopSource) {
    CFRunLoopRemoveSource(g_runtime.runLoop, g_runtime.runLoopSource, kCFRunLoopCommonModes);
    CFRelease(g_runtime.runLoopSource);
    g_runtime.runLoopSource = nullptr;
  }

  if (g_runtime.eventTap) {
    CFRelease(g_runtime.eventTap);
    g_runtime.eventTap = nullptr;
  }

  if (g_runtime.runLoop) {
    CFRelease(g_runtime.runLoop);
    g_runtime.runLoop = nullptr;
  }

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

  g_runtime.worker = std::thread(runEventLoop);

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
  {
    std::lock_guard<std::mutex> lock(g_runtime.mutex);
    if (!g_runtime.running.load()) {
      g_runtime.callback = nullptr;
      return;
    }

    g_runtime.running.store(false);
    g_runtime.callback = nullptr;

    if (g_runtime.eventTap) {
      CGEventTapEnable(g_runtime.eventTap, false);
    }

    if (g_runtime.runLoop) {
      CFRunLoopStop(g_runtime.runLoop);
    }
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

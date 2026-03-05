#ifndef KEYBOARD_HELPER_H
#define KEYBOARD_HELPER_H

#include <stdint.h>

#if defined(_WIN32)
  #if defined(KEYBOARD_HELPER_EXPORTS)
    #define KEYBOARD_HELPER_API __declspec(dllexport)
  #else
    #define KEYBOARD_HELPER_API __declspec(dllimport)
  #endif
#else
  #define KEYBOARD_HELPER_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*KeyboardEventCallback)(
  int32_t key_code,
  const char* key_name,
  int32_t event_type,
  int64_t timestamp_ms,
  int32_t source_type
);

// Returns 1 on success, 0 on failure.
KEYBOARD_HELPER_API int32_t keyboardStart(KeyboardEventCallback callback);
KEYBOARD_HELPER_API void keyboardStop(void);
KEYBOARD_HELPER_API void keyboardSetHotkeys(const char* json_hotkeys);
KEYBOARD_HELPER_API void keyboardResetPressed(void);
KEYBOARD_HELPER_API void keyboardSetPollIntervalMs(int32_t interval_ms);

#ifdef __cplusplus
}
#endif

#endif // KEYBOARD_HELPER_H

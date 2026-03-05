#ifndef KEYBOARD_HELPER_H
#define KEYBOARD_HELPER_H

#include <stdint.h>

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
int32_t keyboardStart(KeyboardEventCallback callback);
void keyboardStop(void);
void keyboardSetHotkeys(const char* json_hotkeys);
void keyboardResetPressed(void);
void keyboardSetPollIntervalMs(int32_t interval_ms);

#ifdef __cplusplus
}
#endif

#endif // KEYBOARD_HELPER_H

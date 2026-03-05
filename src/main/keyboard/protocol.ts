export const KEYBOARD_HELPER_ABI_VERSION = 1

export const KEYBOARD_EVENT_TYPE = {
  UP: 0,
  DOWN: 1,
} as const

export const KEYBOARD_EVENT_SOURCE = {
  PHYSICAL: 0,
  SYNTHETIC: 1,
} as const

export const KEYBOARD_HELPER_ERROR = {
  NOT_INITIALIZED: -1000,
  ACCESS_DENIED: -1001,
  HOOK_INSTALL_FAILED: -1002,
  RUN_LOOP_FAILED: -1003,
  INVALID_ARGUMENT: -1004,
} as const

export type KeyboardHelperErrorCode = typeof KEYBOARD_HELPER_ERROR[keyof typeof KEYBOARD_HELPER_ERROR]

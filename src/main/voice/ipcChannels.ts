export const VOICE_IPC = {
  UI_SHOW: 'voice:ui:show',
  UI_UPDATE: 'voice:ui:update',
  UI_FINAL: 'voice:ui:final',
  UI_HIDE: 'voice:ui:hide',
  UI_TOAST: 'voice:ui:toast',
  COMMAND_TOGGLE: 'voice:command:toggle',
} as const

export type VoiceIpcChannel = (typeof VOICE_IPC)[keyof typeof VOICE_IPC]

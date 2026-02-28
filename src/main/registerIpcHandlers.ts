import type { RegisterIpcHandlersOptions } from './ipc/types'
import { registerAiPolishIpcHandlers } from './ipc/registerAiPolishIpcHandlers'
import { registerAsrIpcHandlers } from './ipc/registerAsrIpcHandlers'
import { registerHistoryIpcHandlers } from './ipc/registerHistoryIpcHandlers'
import { registerSystemIpcHandlers } from './ipc/registerSystemIpcHandlers'
import { registerVoiceIpcHandlers } from './ipc/registerVoiceIpcHandlers'

export type { RegisterIpcHandlersOptions }

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  registerAsrIpcHandlers(options)
  registerVoiceIpcHandlers(options)
  registerHistoryIpcHandlers(options)
  registerSystemIpcHandlers(options)
  registerAiPolishIpcHandlers(options)
}

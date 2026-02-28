import type { BrowserWindow } from 'electron'
import type { AsrService } from '../asrService'
import type { HistoryStore } from '../historyStore'
import type { ModelDownloader } from '../modelManager'
import type { SettingsStore } from '../settingsStore'
import type { PermissionChecker, SessionOrchestrator } from '../voice/types'

export interface RegisterIpcHandlersOptions {
  asrService: AsrService
  historyStore: HistoryStore
  modelDownloader: ModelDownloader
  sessionOrchestrator: SessionOrchestrator
  settingsStore: SettingsStore
  permissionChecker: PermissionChecker
  getMainWindow: () => BrowserWindow | null
  onOnboardingComplete?: () => void
}

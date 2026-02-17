export type MenuKey = 'home' | 'workbench' | 'polish' | 'provider' | 'settings' | 'about'

export type TranscriptSource = 'file' | 'live'
export type HistoryEntryType = 'asr_only' | 'polish'

export interface MenuItem {
  key: MenuKey
  label: string
  hint: string
}

export interface HistoryEntry {
  id: string
  source: TranscriptSource
  entryType: HistoryEntryType
  commandName: string | null
  text: string
  textLength: number
  language: string
  elapsedMs: number
  triggeredAt: number
  createdAt: number
  audioPath: string | null
}

export interface StatCard {
  label: string
  value: string
  tone: string
}

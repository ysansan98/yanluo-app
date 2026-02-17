export type MenuKey = 'home' | 'workbench' | 'polish' | 'provider' | 'settings' | 'about'

export type TranscriptSource = 'file' | 'live'

export interface MenuItem {
  key: MenuKey
  label: string
  hint: string
}

export interface HistoryEntry {
  id: string
  source: TranscriptSource
  text: string
  textLength: number
  language: string
  elapsedMs: number
  createdAt: number
  filePath?: string
}

export interface StatCard {
  label: string
  value: string
  tone: string
}

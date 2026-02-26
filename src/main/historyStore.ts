import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'

export type HistorySource = 'live'
export type HistoryEntryType = 'asr_only' | 'polish'

export interface CreateHistoryEntryPayload {
  source: HistorySource
  entryType: HistoryEntryType
  commandName?: string | null
  text: string
  language?: string
  elapsedMs?: number
  audioPath?: string | null
  triggeredAt?: number
}

export interface HistoryEntry {
  id: string
  source: HistorySource
  entryType: HistoryEntryType
  commandName: string | null
  text: string
  textLength: number
  language: string
  elapsedMs: number
  audioPath: string | null
  triggeredAt: number
  createdAt: number
}

function getDbPath(): string {
  const dataDir = join(app.getPath('userData'), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return join(dataDir, 'records.db')
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export class HistoryStore {
  private db: Database.Database | null = null

  private getDb(): Database.Database {
    if (this.db)
      return this.db
    this.db = new Database(getDbPath())
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history_entries (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        command_name TEXT,
        text TEXT NOT NULL,
        text_length INTEGER NOT NULL,
        language TEXT NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        audio_path TEXT,
        triggered_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_triggered_at ON history_entries(triggered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_history_created_at ON history_entries(created_at DESC);
    `)
    return this.db
  }

  create(payload: CreateHistoryEntryPayload): HistoryEntry {
    const db = this.getDb()
    const now = Date.now()
    const text = payload.text.trim()
    const entry: HistoryEntry = {
      id: createId(),
      source: payload.source,
      entryType: payload.entryType,
      commandName: payload.commandName?.trim() || null,
      text,
      textLength: text.length,
      language: payload.language?.trim() || 'auto',
      elapsedMs: Number.isFinite(payload.elapsedMs)
        ? Math.max(0, Math.round(payload.elapsedMs ?? 0))
        : 0,
      audioPath: payload.audioPath?.trim() || null,
      triggeredAt: payload.triggeredAt ?? now,
      createdAt: now,
    }

    db.prepare(
      `
      INSERT INTO history_entries (
        id, source, entry_type, command_name, text, text_length, language,
        elapsed_ms, audio_path, triggered_at, created_at
      ) VALUES (
        @id, @source, @entryType, @commandName, @text, @textLength, @language,
        @elapsedMs, @audioPath, @triggeredAt, @createdAt
      )
    `,
    ).run(entry)

    return entry
  }

  list(limit = 200): HistoryEntry[] {
    const db = this.getDb()
    const rows = db
      .prepare(
        `
      SELECT
        id,
        source,
        entry_type as entryType,
        command_name as commandName,
        text,
        text_length as textLength,
        language,
        elapsed_ms as elapsedMs,
        audio_path as audioPath,
        triggered_at as triggeredAt,
        created_at as createdAt
      FROM history_entries
      ORDER BY triggered_at DESC
      LIMIT ?
    `,
      )
      .all(limit) as HistoryEntry[]
    return rows
  }

  clear(): void {
    this.getDb().prepare('DELETE FROM history_entries').run()
  }
}

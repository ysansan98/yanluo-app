import type { App } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { basename, join } from 'node:path'
import process from 'node:process'
import { getLogDirPath } from './logger'

export interface ExportLogsOptions {
  minutes: number
}

export interface ExportLogsResult {
  ok: true
  exportPath: string
  exportedFiles: string[]
  lineCount: number
  minutes: number
}

interface LogEntryLike {
  ts?: string
}

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    return 30
  }
  return Math.min(24 * 60, Math.max(1, Math.round(minutes)))
}

function parseLogTimestamp(line: string): number | null {
  try {
    const parsed = JSON.parse(line) as LogEntryLike
    if (!parsed.ts) {
      return null
    }
    const ts = Date.parse(parsed.ts)
    return Number.isNaN(ts) ? null : ts
  }
  catch {
    return null
  }
}

function listCandidateLogFiles(logDir: string): string[] {
  if (!existsSync(logDir)) {
    return []
  }
  const files = readdirSync(logDir)
    .filter(name => /^main\.log(?:\.\d+)?$/.test(name))
    .sort((a, b) => {
      const ai = a === 'main.log' ? 0 : Number(a.split('.')[2] || 0)
      const bi = b === 'main.log' ? 0 : Number(b.split('.')[2] || 0)
      return bi - ai
    })
  return files.map(name => join(logDir, name))
}

function filterRecentLines(filePath: string, thresholdTs: number): string[] {
  const raw = readFileSync(filePath, 'utf8')
  const lines = raw.split('\n').filter(Boolean)
  return lines.filter((line) => {
    const ts = parseLogTimestamp(line)
    if (ts == null) {
      return true
    }
    return ts >= thresholdTs
  })
}

export function exportRecentLogs(
  app: App,
  options: ExportLogsOptions,
): ExportLogsResult {
  const minutes = clampMinutes(options.minutes)
  const thresholdTs = Date.now() - minutes * 60 * 1000
  const logDir = getLogDirPath(app)
  const files = listCandidateLogFiles(logDir)

  const exportRoot = join(app.getPath('userData'), 'logs', 'exports')
  mkdirSync(exportRoot, { recursive: true })
  const exportPath = join(exportRoot, `diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  mkdirSync(exportPath, { recursive: true })

  const exportedFiles: string[] = []
  let lineCount = 0

  for (const filePath of files) {
    const filteredLines = filterRecentLines(filePath, thresholdTs)
    if (filteredLines.length === 0) {
      continue
    }
    lineCount += filteredLines.length
    const outName = `${basename(filePath)}.ndjson`
    writeFileSync(join(exportPath, outName), `${filteredLines.join('\n')}\n`, 'utf8')
    exportedFiles.push(outName)
  }

  const metadata = {
    exportedAt: new Date().toISOString(),
    recentMinutes: minutes,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    hostname: os.hostname(),
    lineCount,
    files: exportedFiles,
  }
  writeFileSync(
    join(exportPath, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf8',
  )

  return {
    ok: true,
    exportPath,
    exportedFiles,
    lineCount,
    minutes,
  }
}

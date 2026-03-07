import type { App } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogExtra = Record<string, unknown>

interface LogEntry {
  ts: string
  level: LogLevel
  scope: string
  message: string
  pid: number
  extra?: LogExtra
}

interface LoggerState {
  minLevel: LogLevel
  maxFileBytes: number
  maxFiles: number
  sampleWindowMs: number
  sampleBurstPerWindow: number
  logFilePath: string | null
}

interface SamplingWindow {
  startedAt: number
  seen: number
  suppressed: number
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const state: LoggerState = {
  minLevel: resolveMinLogLevel(),
  maxFileBytes: Number(process.env.APP_LOG_MAX_FILE_BYTES || 5 * 1024 * 1024),
  maxFiles: Number(process.env.APP_LOG_MAX_FILES || 3),
  sampleWindowMs: Number(process.env.APP_LOG_SAMPLE_WINDOW_MS || 1000),
  sampleBurstPerWindow: Number(process.env.APP_LOG_SAMPLE_BURST || 30),
  logFilePath: null,
}

const samplingWindows = new Map<string, SamplingWindow>()

function resolveMinLogLevel(): LogLevel {
  const rawLevel = process.env.APP_LOG_LEVEL?.toLowerCase()
  if (rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'warn' || rawLevel === 'error') {
    return rawLevel
  }
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info'
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[state.minLevel]
}

function shouldSample(level: LogLevel): boolean {
  return level === 'debug' || level === 'info'
}

function normalizeUnknown(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value
  }
  if (depth > 4) {
    return '[MaxDepth]'
  }
  if (typeof value === 'string') {
    return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeUnknown(item, depth + 1))
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/password|secret|token|api[_-]?key|authorization|cookie/i.test(key)) {
        sanitized[key] = '[REDACTED]'
      }
      else {
        sanitized[key] = normalizeUnknown(nested, depth + 1)
      }
    }
    return sanitized
  }
  return String(value)
}

function toLogExtra(extra?: LogExtra): LogExtra | undefined {
  if (!extra) {
    return undefined
  }
  const normalized = normalizeUnknown(extra) as LogExtra
  return enrichTraceMetadata(normalized)
}

function enrichTraceMetadata(extra: LogExtra): LogExtra {
  const traceId
    = readStringField(extra, 'traceId')
      ?? readStringField(extra, 'sessionId')
      ?? readStringField(extra, 'session_id')

  if (!traceId) {
    return extra
  }
  if (readStringField(extra, 'traceId')) {
    return extra
  }
  return {
    ...extra,
    traceId,
  }
}

function readStringField(source: Record<string, unknown>, field: string): string | null {
  const value = source[field]
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return trimmed
}

function writeFileLog(entry: LogEntry): void {
  if (!state.logFilePath) {
    return
  }

  try {
    appendFileSync(state.logFilePath, `${JSON.stringify(entry)}\n`, 'utf8')
  }
  catch {
    // ignore file logging errors and keep stdout/stderr logging alive
  }
}

function writeEntry(entry: LogEntry): void {
  writeConsoleLog(entry)
  writeFileLog(entry)
}

function writeConsoleLog(entry: LogEntry): void {
  const details = entry.extra ? ` ${safeStringify(entry.extra)}` : ''
  const line = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}${details}`
  if (entry.level === 'error') {
    console.error(line)
    return
  }
  if (entry.level === 'warn') {
    console.warn(line)
    return
  }
  console.info(line)
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  }
  catch {
    return '[Unserializable]'
  }
}

function rotateLogFileIfNeeded(logFilePath: string): void {
  if (!existsSync(logFilePath)) {
    return
  }
  let size = 0
  try {
    size = statSync(logFilePath).size
  }
  catch {
    return
  }
  if (size < state.maxFileBytes) {
    return
  }

  for (let index = state.maxFiles - 1; index >= 1; index -= 1) {
    const source = `${logFilePath}.${index}`
    const target = `${logFilePath}.${index + 1}`
    if (existsSync(source)) {
      try {
        renameSync(source, target)
      }
      catch {}
    }
  }
  try {
    renameSync(logFilePath, `${logFilePath}.1`)
  }
  catch {}
}

function maybeSuppressBySampling(level: LogLevel, scope: string, message: string): boolean {
  if (!shouldSample(level)) {
    return false
  }

  const now = Date.now()
  const key = `${level}|${scope}|${message}`
  const existing = samplingWindows.get(key)

  if (!existing || now - existing.startedAt >= state.sampleWindowMs) {
    if (existing && existing.suppressed > 0) {
      writeEntry({
        ts: new Date().toISOString(),
        level: 'info',
        scope,
        message: 'suppressed repetitive logs',
        pid: process.pid,
        extra: {
          sampleKey: key,
          suppressedCount: existing.suppressed,
          windowMs: state.sampleWindowMs,
        },
      })
    }
    samplingWindows.set(key, {
      startedAt: now,
      seen: 1,
      suppressed: 0,
    })
    return false
  }

  existing.seen += 1
  if (existing.seen > state.sampleBurstPerWindow) {
    existing.suppressed += 1
    return true
  }
  return false
}

function emit(level: LogLevel, scope: string, message: string, extra?: LogExtra): void {
  if (!shouldLog(level)) {
    return
  }
  if (maybeSuppressBySampling(level, scope, message)) {
    return
  }
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    pid: process.pid,
    extra: toLogExtra(extra),
  }
  writeEntry(entry)
}

export interface Logger {
  debug: (message: string, extra?: LogExtra) => void
  info: (message: string, extra?: LogExtra) => void
  warn: (message: string, extra?: LogExtra) => void
  error: (message: string, extra?: LogExtra) => void
  child: (suffix: string) => Logger
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, extra) => emit('debug', scope, message, extra),
    info: (message, extra) => emit('info', scope, message, extra),
    warn: (message, extra) => emit('warn', scope, message, extra),
    error: (message, extra) => emit('error', scope, message, extra),
    child: (suffix: string) => createLogger(`${scope}:${suffix}`),
  }
}

export function initMainLogger(app: App): void {
  try {
    const logDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logDir, { recursive: true })
    const logFilePath = join(logDir, 'main.log')
    rotateLogFileIfNeeded(logFilePath)
    state.logFilePath = logFilePath
  }
  catch {
    state.logFilePath = null
  }
}

export function getLogFilePath(): string | null {
  return state.logFilePath
}

export function getLogDirPath(app: App): string {
  return join(app.getPath('userData'), 'logs')
}

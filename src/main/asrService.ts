import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { createLogger } from './logging'
import { getModelDir, getModelId } from './modelManager'
import {
  buildPythonEnv,
  getAsrServiceDir,
  resolvePythonCmd,
} from './pythonEnv'

const DEFAULT_PORT = 8790
const log = createLogger('asr-service')

function extractTraceIdFromLine(message: string): string | null {
  const directMatch = message.match(/(?:sessionId|session_id|session)=([A-Za-z0-9-]+)/)
  if (directMatch?.[1]) {
    return directMatch[1]
  }
  const quotedMatch = message.match(/['"]sessionId['"]\s*:\s*['"]([A-Za-z0-9-]+)['"]/)
  if (quotedMatch?.[1]) {
    return quotedMatch[1]
  }
  return null
}

export interface AsrHealth {
  status: string
  model_loaded: boolean
  model_error?: string | null
}

export class AsrService {
  private proc: ChildProcessWithoutNullStreams | null = null
  private port = DEFAULT_PORT
  private forceKillTimer: NodeJS.Timeout | null = null

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  async start(): Promise<void> {
    if (this.proc)
      return

    const pythonCmd = resolvePythonCmd()
    const asrServiceDir = getAsrServiceDir()
    const modelName = getModelId()
    const modelDir = getModelDir()
    const allowDownload = process.env.ASR_ALLOW_DOWNLOAD || '0'

    this.proc = spawn(
      pythonCmd,
      [
        '-m',
        'uvicorn',
        'main:app',
        '--host',
        '127.0.0.1',
        '--port',
        String(this.port),
      ],
      {
        cwd: asrServiceDir,
        env: buildPythonEnv({
          ...process.env,
          ASR_MODEL_NAME: modelName,
          ASR_MODEL_DIR: modelDir,
          ASR_ALLOW_DOWNLOAD: allowDownload,
        }),
        stdio: 'pipe',
      },
    )
    log.info('spawned ASR service process', {
      pid: this.proc.pid,
      port: this.port,
      modelName,
      modelDir,
    })

    this.proc.stdout.on('data', (chunk) => {
      const message = chunk.toString().trim()
      const traceId = extractTraceIdFromLine(message)
      log.info('stdout', { message, traceId })
    })
    this.proc.stderr.on('data', (chunk) => {
      const message = chunk.toString().trim()
      const traceId = extractTraceIdFromLine(message)
      log.warn('stderr', { message, traceId })
    })

    this.proc.on('exit', (code, signal) => {
      log.info('ASR service process exited', { code, signal })
      if (this.forceKillTimer) {
        clearTimeout(this.forceKillTimer)
        this.forceKillTimer = null
      }
      this.proc = null
    })

    await this.waitUntilReady()
  }

  stop(): void {
    const proc = this.proc
    if (!proc)
      return

    try {
      proc.kill('SIGTERM')
      log.info('sent SIGTERM to ASR service process')
    }
    catch (err) {
      log.warn('failed to send SIGTERM to ASR service process', { err })
    }

    if (this.forceKillTimer) {
      clearTimeout(this.forceKillTimer)
      this.forceKillTimer = null
    }

    this.forceKillTimer = setTimeout(() => {
      if (!this.proc || this.proc !== proc)
        return
      try {
        proc.kill('SIGKILL')
        log.warn('sent SIGKILL to ASR service process')
      }
      catch (err) {
        log.warn('failed to send SIGKILL to ASR service process', { err })
      }
    }, 800)
    this.forceKillTimer.unref?.()
  }

  async health(): Promise<AsrHealth> {
    const res = await fetch(`${this.baseUrl}/health`)
    if (!res.ok) {
      throw new Error(`Health check failed: ${res.status}`)
    }
    return (await res.json()) as AsrHealth
  }

  async transcribeFile(
    path: string,
    language?: string,
  ): Promise<{ text: string, language: string, elapsed_ms?: number }> {
    const res = await fetch(`${this.baseUrl}/asr/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, language }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`ASR failed: ${res.status} ${body}`)
    }

    return (await res.json()) as {
      text: string
      language: string
      elapsed_ms?: number
    }
  }

  private async waitUntilReady(): Promise<void> {
    const maxAttempts = 50
    const delayMs = 200

    for (let i = 0; i < maxAttempts; i += 1) {
      if (!this.proc) {
        throw new Error('ASR process exited before becoming ready')
      }
      try {
        const res = await fetch(`${this.baseUrl}/health`)
        if (res.ok)
          return
      }
      catch {
        // Keep waiting while service bootstraps.
      }
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    throw new Error('ASR service did not become ready in time')
  }
}

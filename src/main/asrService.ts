import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { getModelDir, getModelId } from './modelManager'
import { buildPythonEnv, getAsrServiceDir, resolvePythonCmd } from './pythonEnv'

const DEFAULT_PORT = 8790

export interface AsrHealth {
  status: string
  model_loaded: boolean
  model_error?: string | null
}

export class AsrService {
  private proc: ChildProcessWithoutNullStreams | null = null
  private port = DEFAULT_PORT

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  async start(): Promise<void> {
    if (this.proc)
      return

    const pythonCmd = resolvePythonCmd()
    const asrServiceDir = getAsrServiceDir()
    const modelDir = getModelDir()

    this.proc = spawn(
      pythonCmd,
      ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(this.port)],
      {
        cwd: asrServiceDir,
        env: buildPythonEnv({
          ...process.env,
          ASR_MODEL_NAME: getModelId(),
          ASR_MODEL_DIR: modelDir,
          ASR_ALLOW_DOWNLOAD: '0',
          ASR_DEVICE: process.platform === 'darwin' ? 'cpu' : process.env.ASR_DEVICE,
        }),
        stdio: 'pipe',
      },
    )

    this.proc.stdout.on('data', (chunk) => {
      console.warn('[asr-service]', chunk.toString().trim())
    })
    this.proc.stderr.on('data', (chunk) => {
      console.error('[asr-service]', chunk.toString().trim())
    })

    this.proc.on('exit', () => {
      this.proc = null
    })

    await this.waitUntilReady()
  }

  stop(): void {
    if (!this.proc)
      return
    this.proc.kill()
    this.proc = null
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

    return (await res.json()) as { text: string, language: string, elapsed_ms?: number }
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

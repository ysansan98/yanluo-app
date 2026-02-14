import type { BrowserWindow } from 'electron'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import { buildPythonEnv, resolvePythonCmd } from './pythonEnv'

const MODEL_ID = 'Qwen/Qwen3-ASR-0.6B'
const MODEL_FOLDER = 'Qwen3-ASR-0.6B'

export const getModelId = (): string => MODEL_ID

export function getModelsRoot(): string {
  const root = join(app.getPath('userData'), 'models')
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true })
  }
  return root
}

export const getModelDir = (): string => join(getModelsRoot(), MODEL_FOLDER)

export function modelExists(): boolean {
  const dir = getModelDir()
  if (!existsSync(dir))
    return false
  try {
    const files = readdirSync(dir)
    const hasConfig = files.includes('config.json')
    const hasWeights
      = files.includes('model.safetensors.index.json')
        || files.some(name => name.endsWith('.safetensors') || name.endsWith('.bin'))
    return hasConfig && hasWeights
  }
  catch {
    return false
  }
}

export class ModelDownloader {
  private proc: ChildProcessWithoutNullStreams | null = null

  get running(): boolean {
    return this.proc !== null
  }

  async start(window: BrowserWindow): Promise<void> {
    if (this.proc) {
      throw new Error('Download already running')
    }

    const pythonCmd = resolvePythonCmd()
    const modelDir = getModelDir()

    this.proc = spawn(
      pythonCmd,
      ['-m', 'modelscope.cli.cli', 'download', '--model', MODEL_ID, '--local_dir', modelDir],
      {
        cwd: app.getAppPath(),
        env: buildPythonEnv(process.env),
        stdio: 'pipe',
      },
    )

    window.webContents.send('asr:downloadLog', { type: 'info', message: 'Download started' })

    this.proc.stdout.on('data', (data) => {
      window.webContents.send('asr:downloadLog', { type: 'stdout', message: data.toString() })
    })

    this.proc.stderr.on('data', (data) => {
      window.webContents.send('asr:downloadLog', { type: 'stderr', message: data.toString() })
    })

    await new Promise<void>((resolve, reject) => {
      this.proc?.on('exit', (code) => {
        const ok = code === 0
        window.webContents.send('asr:downloadLog', {
          type: ok ? 'info' : 'error',
          message: ok ? 'Download finished' : `Download failed with code ${code}`,
        })
        this.proc = null
        if (ok)
          resolve()
        else reject(new Error(`modelscope download failed with code ${code}`))
      })
    })
  }
}

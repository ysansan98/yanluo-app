import type { BrowserWindow } from 'electron'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import { ASR_MODEL_DIR_NAME, ASR_MODEL_ID } from './config/asrDefaults'
import { buildPythonEnv, resolvePythonCmd } from './pythonEnv'

export function getModelId(): string {
  return ASR_MODEL_ID
}

function getModelFolder(): string {
  return ASR_MODEL_DIR_NAME
}

export function getModelsRoot(): string {
  const root = join(app.getPath('userData'), 'models')
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true })
  }
  return root
}

export function getModelDir(): string {
  const folderOrDir = getModelFolder()
  if (isAbsolute(folderOrDir))
    return folderOrDir
  return join(getModelsRoot(), folderOrDir)
}

export function modelExists(): boolean {
  const dir = getModelDir()
  if (!existsSync(dir))
    return false
  try {
    const files = readdirSync(dir)
    const hasConfig = files.includes('configuration.json') || files.includes('config.yaml')
    const hasWeights = files.includes('model_quant.onnx') || files.includes('model.onnx')
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
      ['-m', 'modelscope.cli.cli', 'download', '--model', getModelId(), '--local_dir', modelDir],
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

import type { BrowserWindow } from 'electron'
import type { Buffer } from 'node:buffer'
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
    const hasConfig
      = files.includes('configuration.json') || files.includes('config.yaml')
    const hasWeights
      = files.includes('model_quant.onnx') || files.includes('model.onnx')
    return hasConfig && hasWeights
  }
  catch {
    return false
  }
}

export interface DownloadProgress {
  type: 'start' | 'progress' | 'file_complete' | 'complete' | 'error'
  filename?: string
  downloaded?: number
  total?: number
  percent?: number
  message?: string
  model_id?: string
  local_dir?: string
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

    // 使用自定义下载脚本，支持 JSON 进度回调
    this.proc = spawn(
      pythonCmd,
      ['-m', 'download_model', getModelId(), modelDir],
      {
        cwd: join(app.getAppPath(), 'services/asr'),
        env: buildPythonEnv(process.env),
        stdio: 'pipe',
      },
    )

    this.proc.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n')
      for (const line of lines) {
        if (!line.trim())
          continue
        try {
          // 尝试解析 JSON 进度
          const progress: DownloadProgress = JSON.parse(line)
          window.webContents.send('asr:downloadProgress', progress)
        }
        catch {
          // 非 JSON 行作为普通日志
          window.webContents.send('asr:downloadLog', {
            type: 'stdout',
            message: line,
          })
        }
      }
    })

    this.proc.stderr.on('data', (data) => {
      window.webContents.send('asr:downloadLog', {
        type: 'stderr',
        message: data.toString(),
      })
    })

    await new Promise<void>((resolve, reject) => {
      this.proc?.on('exit', (code) => {
        const ok = code === 0
        this.proc = null
        if (ok)
          resolve()
        else reject(new Error(`model download failed with code ${code}`))
      })
    })
  }
}

import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { app } from 'electron'

/**
 * 获取 ASR 服务目录
 * 开发模式: 项目根目录/services/asr
 * 生产模式: 应用包内 app.asar.unpacked/services/asr
 */
export function getAsrServiceDir(): string {
  const appPath = app.getAppPath()

  // 生产模式: 使用 asarUnpack 解压后的路径
  // app.getAppPath() 返回 .../app.asar，需要改为 app.asar.unpacked
  const unpackedPath = appPath.replace(/\.asar$/, '.asar.unpacked')
  const unpackedDir = join(unpackedPath, 'services', 'asr')
  if (existsSync(unpackedDir)) {
    console.log('[pythonEnv] Using unpacked ASR service dir:', unpackedDir)
    return unpackedDir
  }

  // 备用：尝试直接的 appPath（开发模式）
  const appPathDir = join(appPath, 'services', 'asr')
  if (existsSync(appPathDir)) {
    console.log('[pythonEnv] Using appPath ASR service dir:', appPathDir)
    return appPathDir
  }

  // 开发模式回退
  const devDir = join(process.cwd(), 'services', 'asr')
  console.log('[pythonEnv] Using dev ASR service dir:', devDir)
  return devDir
}

/**
 * 获取嵌入式 Python 目录
 * 生产模式: resources/python (extraResources 复制到此)
 * 开发模式: resources/python (本地准备)
 */
function getEmbeddedPythonDir(): string {
  // 生产环境：从 app.getPath('userData') 附近的 resources 目录找
  // 实际上 electron-builder 的 extraResources 会放在 app.getAppPath() 同级或内部
  const possiblePaths = [
    // macOS .app 包内路径
    join(app.getAppPath(), '..', '..', 'Resources', 'python'),
    // Windows/Linux 安装目录
    join(app.getAppPath(), '..', 'resources', 'python'),
    // 开发模式
    join(process.cwd(), 'resources', 'python'),
    // 备用：直接使用 process.resourcesPath
    join(process.resourcesPath || '', 'python'),
  ]

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p
    }
  }

  // 返回最可能的路径，让后续检查报错
  return join(process.resourcesPath || process.cwd(), 'python')
}

/**
 * 获取 Python 可执行文件路径
 * 仅使用嵌入式 Python
 */
export function resolvePythonCmd(): string {
  const embeddedDir = getEmbeddedPythonDir()
  const isWin = process.platform === 'win32'

  const venvBinDir = isWin
    ? join(embeddedDir, 'Scripts')
    : join(embeddedDir, 'bin')

  // 嵌入式 Python 的候选路径
  // 使用实际的版本化可执行文件（如 python3.12），避免符号链接问题
  const embeddedCandidates = isWin
    ? [
        join(venvBinDir, 'python.exe'),
        join(embeddedDir, 'python.exe'),
      ]
    : [
        join(venvBinDir, 'python3.12'),
        join(venvBinDir, 'python3.11'),
        join(venvBinDir, 'python3.10'),
        join(venvBinDir, 'python3'),
        join(venvBinDir, 'python'),
        join(embeddedDir, 'bin', 'python3.12'),
        join(embeddedDir, 'bin', 'python3.11'),
        join(embeddedDir, 'bin', 'python3.10'),
        join(embeddedDir, 'bin', 'python3'),
        join(embeddedDir, 'bin', 'python'),
      ]

  for (const candidate of embeddedCandidates) {
    if (existsSync(candidate)) {
      console.log('[pythonEnv] Using embedded Python:', candidate)
      return candidate
    }
  }

  throw new Error(
    '[pythonEnv] Embedded Python not found. Please run "pnpm run python:prepare" in project root.',
  )
}

/**
 * 检查是否使用嵌入式 Python
 */
export function isUsingEmbeddedPython(): boolean {
  const cmd = resolvePythonCmd()
  const embeddedDir = getEmbeddedPythonDir()
  return cmd.includes(embeddedDir)
}

/**
 * 构建 Python 环境变量
 */
export function buildPythonEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const embeddedDir = getEmbeddedPythonDir()
  const isWin = process.platform === 'win32'

  if (!existsSync(embeddedDir)) {
    throw new Error(
      '[pythonEnv] Embedded Python directory not found. Please run "pnpm run python:prepare" in project root.',
    )
  }

  const binDir = isWin
    ? join(embeddedDir, 'Scripts')
    : join(embeddedDir, 'bin')

  const pathWithPython = baseEnv.PATH
    ? `${binDir}${delimiter}${baseEnv.PATH}`
    : binDir

  const result: NodeJS.ProcessEnv = {
    ...baseEnv,
    PATH: pathWithPython,
  }

  // 嵌入式 Python 需要设置 PYTHONHOME
  result.PYTHONHOME = embeddedDir

  // 嵌入式环境优化：禁止用户 site-packages，确保隔离性
  result.PYTHONNOUSERSITE = '1'

  return result
}

/**
 * 获取 Python 版本信息（用于调试）
 */
export async function getPythonVersion(): Promise<string> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  try {
    const pythonCmd = resolvePythonCmd()
    const { stdout } = await execFileAsync(pythonCmd, ['--version'])
    return stdout.trim()
  }
  catch (error) {
    return `Error: ${error}`
  }
}

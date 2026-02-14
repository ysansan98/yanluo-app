import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { app } from 'electron'

export function getAsrServiceDir(): string {
  const appPathDir = join(app.getAppPath(), 'services', 'asr')
  if (existsSync(appPathDir))
    return appPathDir
  return join(process.cwd(), 'services', 'asr')
}

const getVenvRoot = (): string => join(getAsrServiceDir(), '.venv')

function getVenvBinDir(): string {
  return process.platform === 'win32' ? join(getVenvRoot(), 'Scripts') : join(getVenvRoot(), 'bin')
}

export function resolvePythonCmd(): string {
  const venvBinDir = getVenvBinDir()
  const venvCandidates
    = process.platform === 'win32'
      ? [join(venvBinDir, 'python.exe')]
      : [join(venvBinDir, 'python3'), join(venvBinDir, 'python')]

  for (const candidate of venvCandidates) {
    if (existsSync(candidate))
      return candidate
  }

  return process.platform === 'win32' ? 'python' : 'python3'
}

export function buildPythonEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const venvRoot = getVenvRoot()
  const venvBinDir = getVenvBinDir()
  if (!existsSync(venvBinDir))
    return { ...baseEnv }

  const pathWithVenv = baseEnv.PATH ? `${venvBinDir}${delimiter}${baseEnv.PATH}` : venvBinDir
  return {
    ...baseEnv,
    PATH: pathWithVenv,
    VIRTUAL_ENV: venvRoot,
  }
}

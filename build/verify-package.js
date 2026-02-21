#!/usr/bin/env node
/**
 * 验证打包后的应用结构
 * 用于 CI 或本地打包后检查
 */

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const DIST_DIR = path.join(__dirname, '..', 'dist')

/**
 * 查找 macOS .app 包的实际路径
 */
function findMacAppBundle(platformDir) {
  const entries = fs.readdirSync(platformDir)
  const appBundle = entries.find(f => f.endsWith('.app'))
  return appBundle ? path.join(platformDir, appBundle) : null
}

function findAppPackage() {
  // 首先检查 macOS（优先检查 .app 包）
  const macDir = path.join(DIST_DIR, 'mac')
  if (fs.existsSync(macDir)) {
    const appBundle = findMacAppBundle(macDir)
    if (appBundle) {
      return { platform: 'mac', dir: macDir, appBundle }
    }
  }

  // 检查其他平台
  const platforms = ['win-unpacked', 'linux-unpacked']
  for (const platform of platforms) {
    const platformDir = path.join(DIST_DIR, platform)
    if (fs.existsSync(platformDir)) {
      return { platform, dir: platformDir }
    }
  }

  // 检查直接的 .app 包（旧格式）
  const macApps = fs.readdirSync(DIST_DIR)
    .filter(f => f.endsWith('.app'))
    .map(f => path.join(DIST_DIR, f))

  if (macApps.length > 0) {
    return { platform: 'mac', dir: path.dirname(macApps[0]), appBundle: macApps[0] }
  }

  return null
}

function getPythonPath(appPackage) {
  const { platform, appBundle } = appPackage

  if (platform === 'mac' && appBundle) {
    return path.join(appBundle, 'Contents', 'Resources', 'python')
  }
  if (platform === 'win-unpacked') {
    return path.join(appPackage.dir, 'resources', 'python')
  }
  if (platform === 'linux-unpacked') {
    return path.join(appPackage.dir, 'resources', 'python')
  }

  // Fallback
  return path.join(appPackage.dir, 'resources', 'python')
}

function getPythonExe(pythonDir, platform) {
  const isWin = platform.includes('win')
  return isWin
    ? path.join(pythonDir, 'python.exe')
    : path.join(pythonDir, 'bin', 'python3')
}

function verifyFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath)
      const size = stats.isDirectory()
        ? getDirSize(filePath)
        : stats.size
      console.log(`✅ ${description}: ${filePath} (${(size / 1024 / 1024).toFixed(1)} MB)`)
      return true
    }
    catch {
      console.log(`✅ ${description}: ${filePath}`)
      return true
    }
  }
  else {
    console.log(`❌ ${description} NOT FOUND: ${filePath}`)
    return false
  }
}

/**
 * 检查 app.asar 内的文件是否存在
 */
function verifyAsarFile(asarPath, internalPath, description) {
  try {
    const files = execSync(`npx asar list "${asarPath}"`, { encoding: 'utf8' })
    if (files.includes(internalPath)) {
      console.log(`✅ ${description}: ${internalPath} in app.asar`)
      return true
    }
    else {
      console.log(`❌ ${description} NOT FOUND: ${internalPath} in app.asar`)
      return false
    }
  }
  catch (error) {
    console.log(`❌ Failed to read app.asar: ${error.message}`)
    return false
  }
}

/**
 * 获取目录大小
 */
function getDirSize(dirPath) {
  let size = 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        size += getDirSize(fullPath)
      }
      else {
        size += fs.statSync(fullPath).size
      }
    }
  }
  catch {
    // 忽略无法访问的文件
  }
  return size
}

function main() {
  console.log('🔍 Verifying package...\n')

  const appPackage = findAppPackage()
  if (!appPackage) {
    console.error('❌ No packaged app found in dist/')
    console.log('Run "pnpm run build:unpack" or "pnpm run build:mac/win/linux" first')
    process.exit(1)
  }

  console.log(`Found package: ${appPackage.platform}`)
  console.log(`Location: ${appPackage.dir}`)
  if (appPackage.appBundle) {
    console.log(`App bundle: ${appPackage.appBundle}\n`)
  }
  else {
    console.log('')
  }

  const pythonDir = getPythonPath(appPackage)
  const pythonExe = getPythonExe(pythonDir, appPackage.platform)

  let allOk = true

  // 检查 Python 目录
  console.log('--- Python Environment ---')
  allOk = verifyFile(pythonDir, 'Python directory') && allOk
  allOk = verifyFile(pythonExe, 'Python executable') && allOk

  // 检查关键依赖
  console.log('\n--- Key Dependencies ---')
  const sitePackages = appPackage.platform.includes('win')
    ? path.join(pythonDir, 'Lib', 'site-packages')
    : path.join(pythonDir, 'lib', 'python3.12', 'site-packages')

  const criticalPackages = [
    'fastapi',
    'uvicorn',
    'sherpa_onnx',
    'onnx',
    'modelscope',
    'soundfile.py',
    'numpy',
    'pydantic',
  ]

  for (const pkg of criticalPackages) {
    const pkgPath = path.join(sitePackages, pkg)
    allOk = verifyFile(pkgPath, pkg) && allOk
  }

  // 测试 Python 可执行性
  console.log('\n--- Runtime Test ---')
  try {
    const version = execSync(`"${pythonExe}" --version`, { encoding: 'utf8' }).trim()
    console.log(`✅ Python version: ${version}`)

    // 测试导入关键模块
    const testScript = `
import sys
sys.path.insert(0, '${sitePackages.replace(/\\/g, '\\\\')}')
import fastapi
import uvicorn
import numpy
import sherpa_onnx
import onnx
import modelscope
import soundfile
print('All imports OK')
`
    const result = execSync(`"${pythonExe}" -c "${testScript}"`, { encoding: 'utf8' }).trim()
    console.log(`✅ Module imports: ${result}`)
  }
  catch (error) {
    console.log(`❌ Runtime test failed: ${error.message}`)
    allOk = false
  }

  // 检查 ASR 服务代码
  console.log('\n--- ASR Service ---')
  let asarPath
  if (appPackage.platform === 'mac' && appPackage.appBundle) {
    asarPath = path.join(appPackage.appBundle, 'Contents', 'Resources', 'app.asar')
  }
  else {
    asarPath = path.join(appPackage.dir, 'resources', 'app.asar')
  }

  allOk = verifyFile(asarPath, 'App bundle (app.asar)') && allOk

  // 检查 app.asar 内的主进程代码
  if (fs.existsSync(asarPath)) {
    allOk = verifyAsarFile(asarPath, '/out/main/index.js', 'Main process bundle') && allOk
  }

  console.log(`\n${allOk ? '✅ All checks passed!' : '❌ Some checks failed'}`)
  process.exit(allOk ? 0 : 1)
}

main()

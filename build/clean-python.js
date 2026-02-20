#!/usr/bin/env node
/**
 * 清理 Python 嵌入式环境中不必要的文件以减小体积
 * 在 prepare-python.js 之后运行
 */

const fs = require('node:fs')
const path = require('node:path')

const PYTHON_DIR = path.join(__dirname, '..', 'resources', 'python')

/**
 * 递归删除目录
 * @params {string} dirPath - 目录路径
 */
function removeDir(dirPath) {
  if (!fs.existsSync(dirPath))
    return

  const entries = fs.readdirSync(dirPath)
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      removeDir(fullPath)
    }
    else {
      fs.unlinkSync(fullPath)
    }
  }
  fs.rmdirSync(dirPath)
}

/**
 * 安全删除路径
 */
function safeRemove(targetPath) {
  if (!fs.existsSync(targetPath))
    return

  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    removeDir(targetPath)
    console.log(`[clean] Removed dir: ${targetPath}`)
  }
  else {
    fs.unlinkSync(targetPath)
    console.log(`[clean] Removed file: ${targetPath}`)
  }
}

/**
 * 获取 site-packages 路径
 */
function getSitePackagesDir() {
  const possiblePaths = [
    path.join(PYTHON_DIR, 'lib', 'python3.12', 'site-packages'),
    path.join(PYTHON_DIR, 'Lib', 'site-packages'), // Windows
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p))
      return p
  }
  return null
}

/**
 * 递归查找并删除测试目录
 */
function removeTests(dir, pattern) {
  if (!fs.existsSync(dir))
    return

  const entries = fs.readdirSync(dir)
  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      if (entry === pattern || entry.startsWith('test_') || entry.endsWith('_test')) {
        safeRemove(fullPath)
      }
      else {
        removeTests(fullPath, pattern)
      }
    }
  }
}

function main() {
  if (!fs.existsSync(PYTHON_DIR)) {
    console.error('Python directory not found:', PYTHON_DIR)
    process.exit(1)
  }

  console.log('Cleaning Python environment...')
  console.log('Directory:', PYTHON_DIR)

  const sitePackages = getSitePackagesDir()
  if (!sitePackages) {
    console.warn('site-packages not found')
  }
  else {
    console.log('site-packages:', sitePackages)

    // 清理从旧 ASR 方案遗留的重型包（funasr + torch 链路）
    const legacyPrefixPatterns = [
      'torch',
      'functorch',
      'torchgen',
      'funasr_onnx',
      'jieba',
      'librosa',
      'numba',
      'llvmlite',
      'scipy',
      'sklearn',
      'scikit_learn',
      'networkx',
      'fsspec',
      'jinja2',
      'sympy',
      'onnxruntime',
      'kaldi_native_fbank',
      '_kaldi_native_fbank',
    ]

    const entries = fs.readdirSync(sitePackages)
    for (const entry of entries) {
      const matched = legacyPrefixPatterns.some(prefix =>
        entry === prefix
        || entry.startsWith(prefix)
      )
      if (matched) {
        safeRemove(path.join(sitePackages, entry))
      }
    }

    // 删除测试目录
    const packagesToClean = [
      'onnx',
      'numpy',
      'modelscope',
      'sherpa_onnx',
      'fastapi',
      'uvicorn',
      'pydantic',
      'starlette',
      'watchfiles',
      'websockets',
      'httptools',
      'soundfile',
      'cffi',
      'pycparser',
    ]

    for (const pkg of packagesToClean) {
      const pkgPath = path.join(sitePackages, pkg)
      if (fs.existsSync(pkgPath)) {
        removeTests(pkgPath, 'tests')
        removeTests(pkgPath, 'test')
      }
    }

    // 删除 onnx 的 backend 和 bin
    safeRemove(path.join(sitePackages, 'onnx', 'backend'))
    safeRemove(path.join(sitePackages, 'onnx', 'bin'))

    // modelscope 仅用于 snapshot_download，裁剪训练/推理相关大目录
    const modelscopeDir = path.join(sitePackages, 'modelscope')
    if (fs.existsSync(modelscopeDir)) {
      const modelscopeHeavyDirs = [
        'models',
        'pipelines',
        'trainers',
        'preprocessors',
        'ops',
        'metrics',
        'exporters',
        'server',
        'cli',
        'msdatasets',
      ]
      for (const dir of modelscopeHeavyDirs) {
        safeRemove(path.join(modelscopeDir, dir))
      }
    }

    // 删除 pip
    safeRemove(path.join(sitePackages, 'pip'))

    // 删除 __pycache__
    function removePycache(dir) {
      if (!fs.existsSync(dir))
        return
      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        if (entry === '__pycache__') {
          safeRemove(fullPath)
        }
        else if (fs.statSync(fullPath).isDirectory()) {
          removePycache(fullPath)
        }
      }
    }
    removePycache(sitePackages)
  }

  // 删除 pip 可执行文件
  const binDir = process.platform === 'win32'
    ? path.join(PYTHON_DIR, 'Scripts')
    : path.join(PYTHON_DIR, 'bin')

  if (fs.existsSync(binDir)) {
    const entries = fs.readdirSync(binDir)
    for (const entry of entries) {
      if (entry.startsWith('pip') || entry.startsWith('wheel')) {
        safeRemove(path.join(binDir, entry))
      }
    }
  }

  // 显示清理后的大小
  const { execSync } = require('node:child_process')
  try {
    const size = execSync(`du -sh "${PYTHON_DIR}"`, { encoding: 'utf8' }).split('\t')[0]
    console.log('\n✅ Python environment cleaned')
    console.log(`Final size: ${size}`)
  }
  catch {
    console.log('\n✅ Python environment cleaned')
  }
}

main()

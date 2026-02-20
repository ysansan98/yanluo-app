#!/usr/bin/env node
/**
 * 准备 Python 嵌入式环境脚本
 * 在构建前下载并配置 python-build-standalone
 *
 * 使用国内镜像（可选）：
 *   export PYTHON_BUILD_STANDALONE_MIRROR=ghfast
 *   或
 *   export PYTHON_BUILD_STANDALONE_MIRROR=https://ghfast.top/
 */

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')

// Python 版本和平台配置
const PYTHON_VERSION = '3.12.8'
const PYTHON_BUILD_DATE = '20250115'

// 国内镜像配置
const MIRRORS = {
  // 默认官方源
  github: 'https://github.com',
  // ghfast - 较稳定的 GitHub 代理
  ghfast: 'https://ghfast.top/https://github.com',
  // ghproxy - 另一个常用代理
  ghproxy: 'https://mirror.ghproxy.com/https://github.com',
  // GitMirror
  gitmirror: 'https://hub.gitmirror.com/github.com',
}

const PLATFORM_CONFIGS = {
  darwin: {
    x64: `cpython-${PYTHON_VERSION}+20250115-x86_64-apple-darwin-install_only.tar.gz`,
    arm64: `cpython-${PYTHON_VERSION}+20250115-aarch64-apple-darwin-install_only.tar.gz`,
  },
  win32: {
    x64: `cpython-${PYTHON_VERSION}+20250115-x86_64-pc-windows-msvc-install_only.tar.gz`,
  },
  linux: {
    x64: `cpython-${PYTHON_VERSION}+20250115-x86_64-unknown-linux-gnu-install_only.tar.gz`,
  },
}

/**
 * 获取基础 URL（支持镜像）
 */
function getBaseUrl() {
  const mirror = process.env.PYTHON_BUILD_STANDALONE_MIRROR || 'github'

  // 如果是预定义的镜像名称
  if (MIRRORS[mirror]) {
    return `${MIRRORS[mirror]}/indygreg/python-build-standalone/releases/download`
  }

  // 如果是完整的 URL（用户自定义）
  if (mirror.startsWith('http')) {
    // 如果用户提供了完整的 URL，使用它
    if (mirror.includes('/indygreg/python-build-standalone/releases/download')) {
      return mirror
    }
    // 否则拼接路径
    return `${mirror.replace(/\/$/, '')}/indygreg/python-build-standalone/releases/download`
  }

  // 默认返回官方源
  return 'https://github.com/indygreg/python-build-standalone/releases/download'
}

function getDownloadUrl(filename) {
  const baseUrl = getBaseUrl()
  return `${baseUrl}/${PYTHON_BUILD_DATE}/${filename}`
}

function downloadFile(url, dest, redirectCount = 0) {
  const MAX_REDIRECTS = 5

  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`)

    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error('Too many redirects'))
      return
    }

    const file = fs.createWriteStream(dest)

    const options = {
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Electron-Builder)',
      },
    }

    https.get(url, options, (response) => {
      // 处理重定向
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close()
        let redirectUrl = response.headers.location

        // 处理相对路径或协议相对 URL
        if (redirectUrl.startsWith('//')) {
          redirectUrl = `https:${redirectUrl}`
        }
        else if (redirectUrl.startsWith('/')) {
          // 可能是代理返回的错误格式，尝试修复
          if (redirectUrl.startsWith('/https://') || redirectUrl.startsWith('/http://')) {
            redirectUrl = redirectUrl.substring(1)
          }
          else {
            // 真正的相对路径，拼接原始 URL
            const urlObj = new URL(url)
            redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`
          }
        }

        console.log(`Redirecting to: ${redirectUrl}`)
        downloadFile(redirectUrl, dest, redirectCount + 1).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        file.close()
        fs.unlink(dest, () => {})
        reject(new Error(`Download failed: HTTP ${response.statusCode}`))
        return
      }

      const totalSize = Number.parseInt(response.headers['content-length'] || '0', 10)
      let downloaded = 0
      let lastPercent = -1

      response.on('data', (chunk) => {
        downloaded += chunk.length
        if (totalSize > 0) {
          const percent = Math.floor((downloaded / totalSize) * 100)
          // 每 5% 更新一次，避免频繁输出
          if (percent !== lastPercent && percent % 5 === 0) {
            process.stdout.write(`\rProgress: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`)
            lastPercent = percent
          }
        }
      })

      response.pipe(file)

      file.on('finish', () => {
        process.stdout.write('\n')
        file.close(() => resolve())
      })
    }).on('error', (err) => {
      file.close()
      fs.unlink(dest, () => {})
      reject(err)
    })

    file.on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

function extractTarGz(tarPath, destDir) {
  console.log(`Extracting: ${tarPath}`)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }
  // macOS/Linux 使用 tar 命令
  if (process.platform !== 'win32') {
    execSync(`tar -xzf "${tarPath}" -C "${destDir}" --strip-components=1`)
  }
  else {
    // Windows 可能需要使用第三方工具如 7z 或 tar（Git Bash 自带）
    try {
      execSync(`tar -xzf "${tarPath}" -C "${destDir}" --strip-components=1`)
    }
    catch {
      console.log('Please install Git Bash or 7zip to extract tar.gz on Windows')
      throw new Error('Extraction failed on Windows')
    }
  }
}

/**
 * 确保 pip 已安装
 */
function ensurePip(pythonPath) {
  try {
    // 用 import 校验 pip 模块是否真实可用，避免仅残留 dist-info 造成误判
    execSync(`"${pythonPath}" -c "import pip"`, { stdio: 'ignore' })
    console.log('pip already installed')
    return
  }
  catch {
    console.log('Installing pip...')
    // 先清理可能残留的 pip 元数据，避免 ensurepip 误判“已安装”
    const sitePackagesCandidates = [
      path.join(__dirname, '..', 'resources', 'python', 'lib', 'python3.12', 'site-packages'),
      path.join(__dirname, '..', 'resources', 'python', 'Lib', 'site-packages'),
    ]
    for (const sitePackages of sitePackagesCandidates) {
      if (!fs.existsSync(sitePackages))
        continue
      for (const entry of fs.readdirSync(sitePackages)) {
        if (entry === 'pip' || entry.startsWith('pip-') || entry.startsWith('pip_')) {
          fs.rmSync(path.join(sitePackages, entry), { recursive: true, force: true })
        }
      }
    }

    // 使用 ensurepip 安装 pip
    try {
      execSync(`"${pythonPath}" -m ensurepip --upgrade`, { stdio: 'inherit' })
      console.log('pip installed successfully')
    }
    catch (error) {
      // ensurepip 可能不可用，尝试下载 get-pip.py
      console.log('ensurepip failed, trying get-pip.py...')
      const https = require('node:https')
      const fs = require('node:fs')
      const os = require('node:os')
      const path = require('node:path')
      
      const getPipPath = path.join(os.tmpdir(), 'get-pip.py')
      
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(getPipPath)
        https.get('https://bootstrap.pypa.io/get-pip.py', (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download get-pip.py: ${response.statusCode}`))
            return
          }
          response.pipe(file)
          file.on('finish', () => {
            file.close(() => {
              try {
                execSync(`"${pythonPath}" "${getPipPath}"`, { stdio: 'inherit' })
                fs.unlinkSync(getPipPath)
                console.log('pip installed via get-pip.py')
                resolve()
              }
              catch (err) {
                reject(err)
              }
            })
          })
        }).on('error', reject)
      })
    }
  }
}

function installDependencies(pythonPath, asrServiceDir) {
  console.log('Installing ASR dependencies...')
  const requirementsPath = path.join(asrServiceDir, 'requirements.txt')

  // 检查是否需要使用国内 PyPI 镜像
  const pypiMirror = process.env.PYPI_MIRROR || ''
  const indexUrlArg = pypiMirror ? `--index-url ${pypiMirror}` : ''

  // 安装 pip 依赖
  // 首先尝试 --prefer-binary（优先使用 wheel，但允许从源码构建）
  const pipArgs = [
    '-m',
    'pip',
    'install',
    '--no-warn-script-location',
    '--disable-pip-version-check',
    '--prefer-binary',
    indexUrlArg,
    '-r',
    requirementsPath,
  ].filter(Boolean)

  try {
    execSync(`"${pythonPath}" ${pipArgs.join(' ')}`, {
      stdio: 'inherit',
      cwd: asrServiceDir,
      env: {
        ...process.env,
        PYTHONNOUSERSITE: '1',
        PIP_NO_CACHE_DIR: '1',
      },
    })
  }
  catch (error) {
    // 如果失败，尝试强制使用 binary（优先保障 sherpa/onnx 可用）
    console.log('\n⚠️  Failed with --prefer-binary, trying with --only-binary for core packages...')

    const binaryOnlyPackages = ['numpy', 'onnx', 'sherpa-onnx-core', 'sherpa-onnx']
    const pipArgsBinary = [
      '-m',
      'pip',
      'install',
      '--no-warn-script-location',
      '--disable-pip-version-check',
      '--only-binary',
      ':all:',
      indexUrlArg,
      ...binaryOnlyPackages,
    ].filter(Boolean)
    
    execSync(`"${pythonPath}" ${pipArgsBinary.join(' ')}`, {
      stdio: 'inherit',
      cwd: asrServiceDir,
      env: {
        ...process.env,
        PYTHONNOUSERSITE: '1',
        PIP_NO_CACHE_DIR: '1',
      },
    })
    
    // 再安装其余依赖
    execSync(`"${pythonPath}" ${pipArgs.join(' ')}`, {
      stdio: 'inherit',
      cwd: asrServiceDir,
      env: {
        ...process.env,
        PYTHONNOUSERSITE: '1',
        PIP_NO_CACHE_DIR: '1',
      },
    })
  }
}

function runCleanup() {
  console.log('\n🧹 Cleaning up unnecessary files...')
  try {
    execSync(`node "${path.join(__dirname, 'clean-python.js')}"`, {
      stdio: 'inherit',
    })
  }
  catch (cleanError) {
    console.warn('⚠️  Cleanup warning:', cleanError.message)
  }
}

async function main() {
  const platform = process.platform
  const arch = process.arch

  const resourcesDir = path.join(__dirname, '..', 'resources')
  const pythonDir = path.join(resourcesDir, 'python')
  const tempDir = path.join(__dirname, '..', 'temp')

  // 获取 Python 可执行文件路径
  // 使用具体版本的可执行文件（如 python3.12）避免符号链接问题
  const pythonExe = process.platform === 'win32'
    ? path.join(pythonDir, 'python.exe')
    : path.join(pythonDir, 'bin', 'python3.12')

  // 检查 Python 是否已存在
  const pythonExists = fs.existsSync(pythonExe)

  // 如果 Python 已存在且强制重新下载标志未设置，只更新依赖
  if (pythonExists && process.env.PYTHON_FORCE_DOWNLOAD !== '1') {
    console.log('🔄 Python already exists, updating dependencies only...')
    console.log(`   Location: ${pythonDir}`)
    console.log('   (Use PYTHON_FORCE_DOWNLOAD=1 to re-download Python)')
    
    const version = execSync(`"${pythonExe}" --version`).toString().trim()
    console.log(`\nPython version: ${version}`)
    
    // 确保 pip 已安装
    await ensurePip(pythonExe)
    
    // 安装/更新依赖
    const asrServiceDir = path.join(__dirname, '..', 'services', 'asr')
    installDependencies(pythonExe, asrServiceDir)

    runCleanup()

    console.log('\n✅ Dependencies updated successfully!')
    return
  }

  // 显示配置信息
  const mirror = process.env.PYTHON_BUILD_STANDALONE_MIRROR || 'github'
  console.log(`Using mirror: ${mirror}`)
  console.log(`Base URL: ${getBaseUrl()}`)

  const config = PLATFORM_CONFIGS[platform]
  if (!config) {
    throw new Error(`Unsupported platform: ${platform}`)
  }

  const filename = config[arch] || config.x64
  if (!filename) {
    throw new Error(`Unsupported architecture: ${arch} on ${platform}`)
  }

  const tarPath = path.join(tempDir, filename)

  // 清理并创建目录
  if (fs.existsSync(pythonDir)) {
    console.log('Removing existing Python directory...')
    fs.rmSync(pythonDir, { recursive: true })
  }
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(pythonDir, { recursive: true })

  try {
    // 下载 Python 嵌入式环境
    const url = getDownloadUrl(filename)
    await downloadFile(url, tarPath)

    // 解压
    extractTarGz(tarPath, pythonDir)

    // 验证 Python 可用
    const version = execSync(`"${pythonExe}" --version`).toString().trim()
    console.log(`Python installed: ${version}`)

    // 安装 ASR 依赖
    const asrServiceDir = path.join(__dirname, '..', 'services', 'asr')
    installDependencies(pythonExe, asrServiceDir)

    // 清理不必要的文件以减小体积
    runCleanup()

    console.log('\n✅ Python environment prepared successfully!')
    console.log(`Location: ${pythonDir}`)
  }
  catch (error) {
    console.error('\n❌ Failed to prepare Python environment')
    console.error(`Error: ${error.message}`)

    // 提供故障排除建议
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      console.log('\n💡 Troubleshooting tips:')
      console.log('   1. Try using a mirror:')
      console.log('      export PYTHON_BUILD_STANDALONE_MIRROR=ghfast')
      console.log('   2. Available mirrors: github, ghfast, ghproxy, gitmirror')
      console.log('   3. Or set a custom mirror URL:')
      console.log('      export PYTHON_BUILD_STANDALONE_MIRROR=https://your-mirror.com/')
    }

    throw error
  }
  finally {
    // 清理临时文件
    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath)
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir)
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * 鍑嗗 Python 宓屽叆寮忕幆澧冭剼鏈?
 * 鍦ㄦ瀯寤哄墠涓嬭浇骞堕厤缃?python-build-standalone
 *
 * 下载源固定使用 GitHub 官方 release
 */

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')
const process = require('node:process')

// Python 鐗堟湰鍜屽钩鍙伴厤缃?
const PYTHON_VERSION = '3.12.8'
const PYTHON_BUILD_DATE = '20250115'
const RELEASE_PATH = '/indygreg/python-build-standalone/releases/download'

// 官方下载源
const GITHUB_BASE = 'https://github.com'

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
 * 获取 python-build-standalone release 基础 URL
 */
function getBaseUrl() {
  return `${GITHUB_BASE}${RELEASE_PATH}`
}

function getDownloadCandidates(filename) {
  const baseUrl = getBaseUrl()
  return [`${baseUrl}/${PYTHON_BUILD_DATE}/${filename}`]
}

async function downloadFileWithFallback(filename, dest) {
  const urls = getDownloadCandidates(filename)
  const errors = []

  for (const url of urls) {
    try {
      await downloadFile(url, dest)
      if (errors.length > 0) {
        console.log(`Downloaded successfully after fallback. URL: ${url}`)
      }
      return
    }
    catch (error) {
      errors.push(`${url} -> ${error.message}`)
      console.warn(`Download failed: ${error.message}`)
    }
  }

  throw new Error(`All download sources failed:\n${errors.join('\n')}`)
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
      // 澶勭悊閲嶅畾鍚?
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close()
        let redirectUrl = response.headers.location

        // 澶勭悊鐩稿璺緞鎴栧崗璁浉瀵?URL
        if (redirectUrl.startsWith('//')) {
          redirectUrl = `https:${redirectUrl}`
        }
        else if (redirectUrl.startsWith('/')) {
          // 鍙兘鏄唬鐞嗚繑鍥炵殑閿欒鏍煎紡锛屽皾璇曚慨澶?
          if (redirectUrl.startsWith('/https://') || redirectUrl.startsWith('/http://')) {
            redirectUrl = redirectUrl.substring(1)
          }
          else {
            // 鐪熸鐨勭浉瀵硅矾寰勶紝鎷兼帴鍘熷 URL
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
          // 姣?5% 鏇存柊涓€娆★紝閬垮厤棰戠箒杈撳嚭
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
  // macOS/Linux 浣跨敤 tar 鍛戒护
  if (process.platform !== 'win32') {
    execSync(`tar -xzf "${tarPath}" -C "${destDir}" --strip-components=1`)
  }
  else {
    // Windows 鍙兘闇€瑕佷娇鐢ㄧ涓夋柟宸ュ叿濡?7z 鎴?tar锛圙it Bash 鑷甫锛?
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
 * 纭繚 pip 宸插畨瑁?
 */
function ensurePip(pythonPath) {
  try {
    // 鐢?import 鏍￠獙 pip 妯″潡鏄惁鐪熷疄鍙敤锛岄伩鍏嶄粎娈嬬暀 dist-info 閫犳垚璇垽
    execSync(`"${pythonPath}" -c "import pip"`, { stdio: 'ignore' })
    console.log('pip already installed')
  }
  catch {
    console.log('Installing pip...')
    // 鍏堟竻鐞嗗彲鑳芥畫鐣欑殑 pip 鍏冩暟鎹紝閬垮厤 ensurepip 璇垽鈥滃凡瀹夎鈥?
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

    // 浣跨敤 ensurepip 瀹夎 pip
    try {
      execSync(`"${pythonPath}" -m ensurepip --upgrade`, { stdio: 'inherit' })
      console.log('pip installed successfully')
    }
    catch {
      // ensurepip 鍙兘涓嶅彲鐢紝灏濊瘯涓嬭浇 get-pip.py
      console.log('ensurepip failed, trying get-pip.py...')
      const fs = require('node:fs')
      const https = require('node:https')
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

  // 妫€鏌ユ槸鍚﹂渶瑕佷娇鐢ㄥ浗鍐?PyPI 闀滃儚
  const pypiMirror = process.env.PYPI_MIRROR || ''
  const indexUrlArg = pypiMirror ? `--index-url ${pypiMirror}` : ''

  // 瀹夎 pip 渚濊禆
  // 棣栧厛灏濊瘯 --prefer-binary锛堜紭鍏堜娇鐢?wheel锛屼絾鍏佽浠庢簮鐮佹瀯寤猴級
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
  catch {
    // 濡傛灉澶辫触锛屽皾璇曞己鍒朵娇鐢?binary锛堜紭鍏堜繚闅?sherpa/onnx 鍙敤锛?
    console.log('\n鈿狅笍  Failed with --prefer-binary, trying with --only-binary for core packages...')

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

    // 鍐嶅畨瑁呭叾浣欎緷璧?
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
  console.log('\n馃Ч Cleaning up unnecessary files...')
  try {
    execSync(`node "${path.join(__dirname, 'clean-python.js')}"`, {
      stdio: 'inherit',
    })
  }
  catch (cleanError) {
    console.warn('鈿狅笍  Cleanup warning:', cleanError.message)
  }
}

async function main() {
  const platform = process.platform
  const arch = process.arch

  const resourcesDir = path.join(__dirname, '..', 'resources')
  const pythonDir = path.join(resourcesDir, 'python')
  const tempDir = path.join(__dirname, '..', 'temp')

  // 鑾峰彇 Python 鍙墽琛屾枃浠惰矾寰?
  // 浣跨敤鍏蜂綋鐗堟湰鐨勫彲鎵ц鏂囦欢锛堝 python3.12锛夐伩鍏嶇鍙烽摼鎺ラ棶棰?
  const pythonExe = process.platform === 'win32'
    ? path.join(pythonDir, 'python.exe')
    : path.join(pythonDir, 'bin', 'python3.12')

  // 妫€鏌?Python 鏄惁宸插瓨鍦?
  const pythonExists = fs.existsSync(pythonExe)

  // 濡傛灉 Python 宸插瓨鍦ㄤ笖寮哄埗閲嶆柊涓嬭浇鏍囧織鏈缃紝鍙洿鏂颁緷璧?
  if (pythonExists && process.env.PYTHON_FORCE_DOWNLOAD !== '1') {
    console.log('馃攧 Python already exists, updating dependencies only...')
    console.log(`   Location: ${pythonDir}`)
    console.log('   (Use PYTHON_FORCE_DOWNLOAD=1 to re-download Python)')

    const version = execSync(`"${pythonExe}" --version`).toString().trim()
    console.log(`\nPython version: ${version}`)

    // 纭繚 pip 宸插畨瑁?
    await ensurePip(pythonExe)

    // 瀹夎/鏇存柊渚濊禆
    const asrServiceDir = path.join(__dirname, '..', 'services', 'asr')
    installDependencies(pythonExe, asrServiceDir)

    runCleanup()

    console.log('\n鉁?Dependencies updated successfully!')
    return
  }

  // 鏄剧ず閰嶇疆淇℃伅
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

  // 娓呯悊骞跺垱寤虹洰褰?
  if (fs.existsSync(pythonDir)) {
    console.log('Removing existing Python directory...')
    fs.rmSync(pythonDir, { recursive: true })
  }
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(pythonDir, { recursive: true })

  try {
    // 涓嬭浇 Python 宓屽叆寮忕幆澧?
    await downloadFileWithFallback(filename, tarPath)

    // 瑙ｅ帇
    extractTarGz(tarPath, pythonDir)

    // 楠岃瘉 Python 鍙敤
    const version = execSync(`"${pythonExe}" --version`).toString().trim()
    console.log(`Python installed: ${version}`)

    // 瀹夎 ASR 渚濊禆
    const asrServiceDir = path.join(__dirname, '..', 'services', 'asr')
    installDependencies(pythonExe, asrServiceDir)

    // 娓呯悊涓嶅繀瑕佺殑鏂囦欢浠ュ噺灏忎綋绉?
    runCleanup()

    console.log('\n鉁?Python environment prepared successfully!')
    console.log(`Location: ${pythonDir}`)
  }
  catch (error) {
    console.error('\n鉂?Failed to prepare Python environment')
    console.error(`Error: ${error.message}`)

    // 鎻愪緵鏁呴殰鎺掗櫎寤鸿
    if (
      error.message.includes('ECONNREFUSED')
      || error.message.includes('ETIMEDOUT')
      || error.message.includes('HTTP 403')
      || error.message.includes('HTTP 404')
      || error.message.includes('All download sources failed')
    ) {
      console.log('\n馃挕 Troubleshooting tips:')
      console.log('   1. Try using a mirror:')
      console.log('      PowerShell: $env:PYTHON_BUILD_STANDALONE_MIRROR=\"ghfast\"')
      console.log('      Bash: export PYTHON_BUILD_STANDALONE_MIRROR=ghfast')
      console.log('   2. Available mirrors: github, ghfast, ghproxy, gitmirror')
      console.log('   3. Or set a custom mirror URL:')
      console.log('      PowerShell: $env:PYTHON_BUILD_STANDALONE_MIRROR=\"https://your-mirror.com/\"')
      console.log('      Bash: export PYTHON_BUILD_STANDALONE_MIRROR=https://your-mirror.com/')
    }

    throw error
  }
  finally {
    // 娓呯悊涓存椂鏂囦欢
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

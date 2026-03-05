/* eslint-disable no-template-curly-in-string */
import type { Configuration } from 'electron-builder'

/**
 * Electron Builder 配置
 * 使用 TypeScript 格式以支持类型检查和动态配置
 *
 * @see https://www.electron.build/configuration/configuration
 */
const config: Configuration = {
  appId: 'com.yanluo.app',
  productName: '言落',
  electronLanguages: ['en-US'],

  directories: {
    buildResources: 'build',
  },

  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}',
    // 排除开发用的 Python 虚拟环境（使用嵌入式 Python）
    '!services/asr/.venv',
    '!services/asr/.venv/**',
    // 排除测试音频文件
    '!qwen_asr_en.wav',
    '!**/*.wav',
    '!**/*.mp3',
    // 排除模型文件（运行时下载）
    '!services/asr/models',
    '!services/asr/models/**',
    // 排除 Python 缓存和开发文件
    '!**/__pycache__',
    '!**/__pycache__/**',
    '!**/*.py[cod]',
    '!services/asr/.python-version',
    '!services/asr/shims/**',
  ],

  asarUnpack: [
    'resources/**',
    'services/asr/**',
  ],

  // Python 嵌入式环境打包配置
  extraResources: [
    {
      from: 'resources/lib',
      to: 'lib',
      filter: [
        '**/*',
      ],
    },
    {
      from: 'resources/python',
      to: 'python',
      filter: [
        '**/*',
        // 排除不必要的文件以减小体积
        '!lib/python3.12/test/**',
        '!lib/python3.12/idlelib/**',
        '!lib/python3.12/tkinter/**',
        '!lib/python3.12/lib2to3/**',
        '!lib/python3.12/ensurepip/**',
        '!lib/python3.12/pydoc_data/**',
        '!bin/idle*',
        '!bin/2to3*',
        '!bin/pydoc*',
        '!share/**',
        // 排除 pip 和开发工具（运行时不需要）
        '!bin/pip*',
        '!bin/wheel*',
        '!lib/python3.12/site-packages/pip/**',
        '!lib/python3.12/site-packages/pip-*/**',
        '!lib/python3.12/site-packages/wheel/**',
        '!lib/python3.12/site-packages/wheel-*/**',
        // 排除 scipy 测试数据
        '!lib/python3.12/site-packages/scipy/**/tests/**',
        // 排除 onnx 测试数据（保留核心 so 文件）
        '!lib/python3.12/site-packages/onnx/backend/**',
        '!lib/python3.12/site-packages/onnx/bin/**',
        // 排除 onnxruntime 测试数据
        '!lib/python3.12/site-packages/onnxruntime/datasets/**',
        '!lib/python3.12/site-packages/onnxruntime/**/test*/**',
        // 排除 sklearn 测试数据
        '!lib/python3.12/site-packages/sklearn/**/tests/**',
        // 排除模型scope的缓存和示例
        '!lib/python3.12/site-packages/modelscope/**/*.pyc',
      ],
    },
  ],

  // Windows 配置
  win: {
    executableName: 'yanluo-app',
  },

  nsis: {
    artifactName: '${name}-${version}-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },

  // macOS 配置
  mac: {
    category: 'public.app-category.productivity',
    target: ['dmg', 'zip'],
    entitlementsInherit: 'build/entitlements.mac.plist',
    extendInfo: {
      CFBundleName: '言落',
      CFBundleDisplayName: '言落',
      NSCameraUsageDescription: 'Application requests access to the device\'s camera.',
      NSMicrophoneUsageDescription: 'Application requests access to the device\'s microphone.',
      NSDocumentsFolderUsageDescription: 'Application requests access to the user\'s Documents folder.',
      NSDownloadsFolderUsageDescription: 'Application requests access to the user\'s Downloads folder.',
    },
    notarize: false,
  },

  dmg: {
    artifactName: '${name}-${version}.${ext}',
  },

  // Linux 配置
  linux: {
    target: [
      'AppImage',
      'snap',
      'deb',
    ],
    maintainer: 'electronjs.org',
    category: 'Utility',
  },

  appImage: {
    artifactName: '${name}-${version}.${ext}',
  },

  npmRebuild: false,

  publish: {
    provider: 'generic',
    url: 'https://example.com/auto-updates',
  },

  // 注意：如果需要使用国内镜像加速 electron 下载，请设置环境变量：
  // export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  // 不要在配置中硬编码，否则可能导致 dmg-builder 等工具下载失败
}

export default config

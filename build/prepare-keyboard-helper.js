#!/usr/bin/env node
const { existsSync, cpSync, mkdirSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { exit, platform } = require('node:process')

const root = resolve(__dirname, '..')
const targetDir = join(root, 'resources', 'lib', 'keyboard-helper', 'build')
mkdirSync(targetDir, { recursive: true })

const candidates = platform === 'darwin'
  ? [
      join(root, 'native', 'keyboard-helper', 'build-mac', 'libKeyboardHelper.dylib'),
      join(root, 'native', 'keyboard-helper', 'build', 'libKeyboardHelper.dylib'),
    ]
  : platform === 'win32'
    ? [
        join(root, 'native', 'keyboard-helper', 'build-win-msvc', 'Release', 'KeyboardHelper.dll'),
        join(root, 'native', 'keyboard-helper', 'build-win', 'Release', 'KeyboardHelper.dll'),
        join(root, 'native', 'keyboard-helper', 'build', 'Release', 'KeyboardHelper.dll'),
      ]
    : []

if (candidates.length === 0) {
  console.warn(`[keyboard-helper] skip copy on unsupported platform: ${platform}`)
  exit(0)
}

const source = candidates.find(p => existsSync(p))
if (!source) {
  console.warn('[keyboard-helper] no compiled binary found, skip copy')
  console.warn('[keyboard-helper] expected one of:')
  candidates.forEach(p => console.warn(`  - ${p}`))
  exit(0)
}

const targetName = platform === 'darwin' ? 'libKeyboardHelper.dylib' : 'KeyboardHelper.dll'
const targetPath = join(targetDir, targetName)
cpSync(source, targetPath)
console.log(`[keyboard-helper] copied ${source} -> ${targetPath}`)

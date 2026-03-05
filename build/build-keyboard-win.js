#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const process = require('node:process')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function readVsGenerator(rootDir) {
  const vswherePath = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe'
  if (!existsSync(vswherePath)) {
    return null
  }

  const query = spawnSync(vswherePath, ['-products', '*', '-latest', '-format', 'json'], {
    cwd: rootDir,
    encoding: 'utf8',
  })
  if (query.status !== 0 || !query.stdout) {
    return null
  }

  try {
    const instances = JSON.parse(query.stdout)
    const first = Array.isArray(instances) ? instances[0] : null
    const major = first?.catalog?.productLineVersion
      ?? first?.installationVersion?.split('.')?.[0]
      ?? ''
    const map = {
      '18': 'Visual Studio 18 2026',
      '17': 'Visual Studio 17 2022',
      '16': 'Visual Studio 16 2019',
    }
    return map[String(major)] ?? null
  }
  catch {
    return null
  }
}

if (process.platform !== 'win32') {
  console.warn(`[keyboard-helper] skip build on unsupported platform: ${process.platform}`)
  process.exit(0)
}

const rootDir = resolve(__dirname, '..')
const sourceDir = join(rootDir, 'native', 'keyboard-helper')
const buildDir = join(rootDir, 'native', 'keyboard-helper', 'build-win-msvc')
const generator = readVsGenerator(rootDir)

if (!generator) {
  console.error('[keyboard-helper] cannot detect Visual Studio Build Tools instance via vswhere')
  console.error('[keyboard-helper] please install Build Tools with C++ workload')
  process.exit(1)
}

console.log(`[keyboard-helper] using generator: ${generator}`)

run('cmake', ['-S', sourceDir, '-B', buildDir, '-G', generator, '-A', 'x64'], { cwd: rootDir })
run('cmake', ['--build', buildDir, '--config', 'Release'], { cwd: rootDir })
run(process.execPath, [join(rootDir, 'build', 'prepare-keyboard-helper.js')], { cwd: rootDir })

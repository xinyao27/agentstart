#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
// Why: npm and bunx need one portable entrypoint that installs the platform Rust binary, verifies
// its release checksum, rolls setup back as one transaction, and forwards argv.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

import { pathExists } from './install/filesystem-state.mjs'
import { installReleaseTransaction } from './install/transaction.mjs'

const packageMetadata = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'))
const packageVersion = packageMetadata.version
const target = resolveTarget()
const executableName = process.platform === 'win32' ? 'agentstart.exe' : 'agentstart'
const assetName = `agentstart-${target}${process.platform === 'win32' ? '.exe' : ''}`
const configuredInstallDirectory =
  process.env.AGENTSTART_INSTALL_DIR ||
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || homedir(), 'AgentStart', 'bin')
    : join(homedir(), '.local', 'bin'))
const installDirectory = isAbsolute(configuredInstallDirectory)
  ? configuredInstallDirectory
  : resolve(configuredInstallDirectory)
const executablePath = join(installDirectory, executableName)
const versionPath = join(installDirectory, 'agentstart.version')

try {
  const exitCode = await main()
  process.exit(exitCode)
} catch (error) {
  if (error && typeof error === 'object' && 'installSignal' in error) {
    const signal = String(error.installSignal)
    console.error(`AgentStart installation interrupted by ${signal}.`)
    process.exitCode = signalExitCode(signal)
  } else {
    throw error
  }
}

async function main() {
  if (!pathExists(executablePath) || readInstalledVersion() !== packageVersion) {
    await installReleaseTransaction({
      assetName,
      executablePath,
      installDirectory,
      packageVersion,
      repository: 'xinyao27/agentstart',
      versionPath
    })
  }
  const result = spawnSync(executablePath, process.argv.slice(2), { stdio: 'inherit' })
  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
}

function readInstalledVersion() {
  try {
    return readFileSync(versionPath, 'utf8').trim()
  } catch {
    return ''
  }
}

function signalExitCode(signal) {
  return { SIGHUP: 129, SIGINT: 130, SIGBREAK: 131, SIGTERM: 143 }[signal] || 1
}

function resolveTarget() {
  const architecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : ''
  if (!architecture) {
    throw new Error(`Unsupported CPU architecture: ${process.arch}`)
  }
  if (process.platform === 'darwin') {
    return `rust-darwin-${architecture}`
  }
  if (process.platform === 'win32' && architecture === 'x64') {
    return 'rust-windows-x64'
  }
  if (process.platform === 'linux') {
    const report = process.report?.getReport()
    const isMusl = !report?.header?.glibcVersionRuntime
    return `rust-linux-${architecture}${isMusl ? '-musl' : ''}`
  }
  throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`)
}

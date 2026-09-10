// Why: daemon dev takeover may stop a running process only after proving that the installed
// Native Messaging app owns it, which needs process metadata that differs across host platforms.
import { spawnSync } from 'node:child_process'
import { readlinkSync } from 'node:fs'
import { basename, dirname, join, normalize } from 'node:path'

const RUNTIME_PUBLICATION_TIMEOUT_MS = 10_000
const RUNTIME_PUBLICATION_POLL_MS = 100

export function captureProcessExecutable(pid) {
  if (process.platform === 'win32') {
    const script =
      '$process = Get-Process -Id $args[0] -ErrorAction SilentlyContinue; if ($null -eq $process) { exit 3 }; [Console]::Out.Write($process.Path)'
    const result = spawnSync(
      windowsPowerShellExecutable(),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, String(pid)],
      { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    return result.status === 0 ? result.stdout.trim() || null : null
  }
  if (process.platform === 'linux') {
    try {
      return readlinkSync(`/proc/${pid}/exe`)
    } catch {
      return null
    }
  }
  const result = spawnSync('ps', ['-o', 'comm=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })
  return result.status === 0 ? result.stdout.trim() || null : null
}

export function captureProcessParentPid(pid) {
  if (process.platform === 'win32') {
    return null
  }
  const result = spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })
  if (result.status !== 0) {
    return null
  }
  const parentPid = Number.parseInt(result.stdout.trim(), 10)
  return Number.isInteger(parentPid) && parentPid > 0 ? parentPid : null
}

export function findMacOSMenuBarDaemon(expectedDaemon) {
  if (process.platform !== 'darwin') {
    return null
  }
  const hostExecutable = join(dirname(expectedDaemon), 'AgentStartMenuBar')
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,comm='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  if (result.error || result.status !== 0) {
    throw new Error('macOS menu bar daemon process enumeration failed')
  }
  const matches = result.stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
    if (!match || !sameExecutable(match[3].trim(), expectedDaemon)) {
      return []
    }
    const pid = Number.parseInt(match[1], 10)
    const hostPid = Number.parseInt(match[2], 10)
    return sameExecutable(captureProcessExecutable(hostPid), hostExecutable)
      ? [{ hostPid, pid }]
      : []
  })
  if (matches.length > 1) {
    throw new Error('more than one unpublished AgentStartMenuBar daemon is running')
  }
  return matches[0] ?? null
}

export async function waitForOriginalRuntimePublication({ expectedDaemon, readRuntime, service }) {
  const unpublished = unpublishedOriginalRuntime(service, expectedDaemon)
  if (!unpublished) {
    return readRuntime()
  }
  const deadline = Date.now() + RUNTIME_PUBLICATION_TIMEOUT_MS
  for (;;) {
    const current = readRuntime()
    if (current?.state === 'running') {
      if (current.pid !== unpublished.pid) {
        throw new Error('another daemon published runtime state during dev takeover')
      }
      return current
    }
    if (captureProcessExecutable(unpublished.pid) === null) {
      return current
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `${unpublished.kind} daemon pid ${unpublished.pid} holds the runtime lock without publishing its identity`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, RUNTIME_PUBLICATION_POLL_MS))
  }
}

export function captureMacOSMenuBarRuntime(current, expectedDaemon) {
  if (process.platform !== 'darwin') {
    throw new Error('a reachable daemon outside the installed service cannot be taken over')
  }
  if (current?.state !== 'running' || !hasRuntimeIdentity(current)) {
    throw new Error('the running Native Messaging daemon has no runtime identity')
  }
  const actualDaemon = captureProcessExecutable(current.pid)
  if (!sameExecutable(actualDaemon, expectedDaemon)) {
    throw new Error('a running daemon does not match the original Native Messaging executable')
  }
  const macOSDirectory = dirname(actualDaemon)
  const contentsDirectory = dirname(macOSDirectory)
  const appBundle = dirname(contentsDirectory)
  if (
    basename(actualDaemon) !== 'agentstart' ||
    basename(macOSDirectory) !== 'MacOS' ||
    basename(contentsDirectory) !== 'Contents' ||
    !basename(appBundle).endsWith('.app')
  ) {
    throw new Error('the running Native Messaging daemon is not inside a macOS app bundle')
  }
  const hostPid = captureProcessParentPid(current.pid)
  const hostExecutable = join(macOSDirectory, 'AgentStartMenuBar')
  if (!hostPid || !sameExecutable(captureProcessExecutable(hostPid), hostExecutable)) {
    throw new Error('the running Native Messaging daemon is not owned by AgentStartMenuBar')
  }
  return {
    appBundle,
    daemonExecutable: actualDaemon,
    hostExecutable,
    hostPid,
    restorePending: false,
    restoredRuntime: null,
    runtime: { pid: current.pid, runtimeId: current.runtimeId }
  }
}

export function menuBarOwnsProcess(menuBar, runtime, expectedHostPid = null) {
  if (runtime?.state !== 'running' || !hasRuntimeIdentity(runtime)) {
    return false
  }
  const hostPid = captureProcessParentPid(runtime.pid)
  return Boolean(
    hostPid &&
    (!expectedHostPid || hostPid === expectedHostPid) &&
    sameExecutable(captureProcessExecutable(runtime.pid), menuBar.daemonExecutable) &&
    sameExecutable(captureProcessExecutable(hostPid), menuBar.hostExecutable)
  )
}

export function menuBarRuntimeReady(menuBar, runtime) {
  return runtime?.reachable === true && menuBarOwnsProcess(menuBar, runtime)
}

export function sameExecutable(left, right) {
  if (!left || !right) {
    return false
  }
  const leftKey = normalize(left)
  const rightKey = normalize(right)
  return process.platform === 'win32'
    ? leftKey.toLowerCase() === rightKey.toLowerCase()
    : leftKey === rightKey
}

function hasRuntimeIdentity(status) {
  return (
    Number.isInteger(status?.pid) &&
    status.pid > 0 &&
    typeof status.runtimeId === 'string' &&
    status.runtimeId.length > 0
  )
}

function unpublishedOriginalRuntime(service, expectedDaemon) {
  if (service.state === 'running') {
    if (
      !service.pid ||
      !sameExecutable(service.executable, expectedDaemon) ||
      !sameExecutable(captureProcessExecutable(service.pid), service.executable)
    ) {
      throw new Error('the unpublished installed daemon service has an unexpected executable')
    }
    return { kind: 'service', pid: service.pid }
  }
  const menuBar = findMacOSMenuBarDaemon(expectedDaemon)
  return menuBar ? { kind: 'menu bar', pid: menuBar.pid } : null
}

function windowsPowerShellExecutable() {
  const systemRoot = process.env.SystemRoot?.trim()
  return systemRoot
    ? join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
}

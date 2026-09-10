// Why: parent and guardian processes must transfer a crash-recovery lease without trusting a
// reusable PID or allowing a new dev run to race an older guardian.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  readJsonRequired,
  removeDurably,
  writeJsonDurably,
  writeJsonNewDurably
} from './dev-daemon-installation.mjs'

const GUARDIAN_READY_TIMEOUT_MS = 5_000
const TRANSITION_LOCK_TIMEOUT_MS = 10_000
const TRANSITION_LOCK_STALE_MS = 15_000
const LEASE_SCHEMA_VERSION = 1
let currentProcessOwnershipToken = null

export async function claimSupervisorLease(paths) {
  mkdirSync(paths.directory, { recursive: true })
  const leaseId = randomUUID()
  const parentToken = shortOwnershipToken()
  if (process.platform !== 'win32') {
    process.title = `as-${parentToken}`
  }
  currentProcessOwnershipToken = parentToken
  const parent = processIdentity(process.pid, parentToken)
  await withTransitionLock(paths, async () => {
    const existing = readLease(paths.lease)
    if (existing) {
      if (processMatches(existing.parent) || processMatches(existing.guardian)) {
        const owner = processMatches(existing.guardian) ? existing.guardian : existing.parent
        throw new Error(`another daemon dev supervisor is already running with pid ${owner.pid}`)
      }
      if (!existing.guardian && Date.now() - existing.createdAtMs < GUARDIAN_READY_TIMEOUT_MS) {
        throw new Error('previous daemon guardian handshake is still within its recovery window')
      }
    }
    const lease = {
      createdAtMs: Date.now(),
      guardian: null,
      leaseId,
      parent,
      phase: existing ? 'recovering_stale_state' : 'starting',
      schemaVersion: LEASE_SCHEMA_VERSION
    }
    if (existing) {
      writeJsonDurably(paths.lease, lease)
    } else {
      writeJsonNewDurably(paths.lease, lease)
    }
  })
  return { leaseId, parent }
}

export async function attachGuardianToLease(paths, leaseId, parent) {
  const guardianToken = leaseId
  currentProcessOwnershipToken = guardianToken
  const guardian = processIdentity(process.pid, guardianToken)
  await withTransitionLock(paths, async () => {
    const lease = readLease(paths.lease)
    if (!lease || lease.leaseId !== leaseId || !sameIdentity(lease.parent, parent)) {
      throw new Error('daemon guardian lease is no longer owned by its parent')
    }
    writeJsonDurably(paths.lease, { ...lease, guardian, phase: 'ready' })
  })
  return guardian
}

function shortOwnershipToken() {
  return randomUUID().replaceAll('-', '').slice(0, 12)
}

export async function markGuardianRecovering(paths, leaseId, guardian) {
  return withTransitionLock(paths, async () => {
    const lease = readLease(paths.lease)
    if (!lease || lease.leaseId !== leaseId || !sameIdentity(lease.guardian, guardian)) {
      return false
    }
    writeJsonDurably(paths.lease, { ...lease, phase: 'recovering' })
    return true
  })
}

export async function releaseSupervisorLease(paths, leaseId) {
  await withTransitionLock(paths, async () => {
    const lease = readLease(paths.lease)
    if (lease?.leaseId === leaseId) {
      removeDurably(paths.lease)
    }
  })
}

export async function waitForGuardianReady(child, leaseId) {
  await new Promise((resolve, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      child.removeListener('message', onMessage)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const onError = (error) => finish(error)
    const onExit = (code, signal) =>
      finish(new Error(`daemon recovery guardian exited before ready (${signal ?? code})`))
    const onMessage = (message) => {
      if (message?.type === 'ready' && message.leaseId === leaseId) {
        finish()
      }
    }
    const timeout = setTimeout(
      () => finish(new Error('daemon recovery guardian did not become ready')),
      GUARDIAN_READY_TIMEOUT_MS
    )
    child.once('error', onError)
    child.once('exit', onExit)
    child.on('message', onMessage)
  })
}

export function processMatches(identity) {
  if (!identity || !processIsRunning(identity.pid)) {
    return false
  }
  return (
    processBirthIdentity(identity.pid) === identity.birthIdentity &&
    processHasOwnershipToken(identity.pid, identity.ownershipToken)
  )
}

export function processIdentity(pid, ownershipToken = currentProcessOwnershipToken) {
  const birthIdentity = processBirthIdentity(pid)
  if (!birthIdentity) {
    throw new Error(`process birth identity is unavailable for pid ${pid}`)
  }
  return { birthIdentity, ownershipToken, pid }
}

export function findProcessIdentityByToken(ownershipToken) {
  const pids = processIdsWithToken(ownershipToken)
  const identities = pids.flatMap((pid) => {
    try {
      return [processIdentity(pid, ownershipToken)]
    } catch (error) {
      if (!processIsRunning(pid)) {
        return []
      }
      throw error
    }
  })
  if (identities.length > 1) {
    throw new Error('debug daemon ownership token matched more than one process')
  }
  return identities[0] ?? null
}

function processIdsWithToken(token) {
  if (process.platform === 'win32') {
    const script =
      "$matches = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'agentstart.exe' -and $_.CommandLine -like ('*--dev-supervisor-token*' + $args[0] + '*') }); $matches | ForEach-Object { [Console]::Out.WriteLine($_.ProcessId) }"
    const result = spawnSync(
      windowsPowerShellExecutable(),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, token],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    if (result.error) {
      throw new Error(`Windows process enumeration failed: ${result.error.message}`)
    }
    if (result.status !== 0) {
      throw new Error(`Windows process enumeration exited with status ${result.status}`)
    }
    return parseProcessIds(result.stdout)
  }
  const result = spawnSync('ps', ['-ww', '-axo', 'pid=,command='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  if (result.error) {
    throw new Error(`process enumeration failed: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`process enumeration exited with status ${result.status}`)
  }
  return parseProcessIds(
    result.stdout
      .split('\n')
      .filter((line) => line.includes('--dev-supervisor-token') && line.includes(token))
      .join('\n')
  )
}

function parseProcessIds(output) {
  return output
    .split('\n')
    .map((line) => Number.parseInt(line.trim().split(/\s+/, 1)[0], 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

function processBirthIdentity(pid) {
  if (process.platform === 'win32') {
    const script =
      '$process = Get-Process -Id $args[0] -ErrorAction SilentlyContinue; if ($null -eq $process) { exit 3 }; [Console]::Out.Write($process.StartTime.ToUniversalTime().Ticks)'
    const result = spawnSync(
      windowsPowerShellExecutable(),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, String(pid)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    if (result.error) {
      throw new Error(`process birth lookup failed: ${result.error.message}`)
    }
    if (result.status !== 0) {
      if (!processIsRunning(pid)) {
        return null
      }
      throw new Error(`process birth lookup exited with status ${result.status}`)
    }
    return result.stdout.trim() || null
  }
  if (process.platform === 'linux') {
    try {
      const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').trim()
      const commandEnd = stat.lastIndexOf(')')
      const startTicks =
        commandEnd < 0
          ? null
          : stat
              .slice(commandEnd + 1)
              .trim()
              .split(/\s+/)[19]
      return bootId && startTicks ? `${bootId}:${startTicks}` : null
    } catch (error) {
      if (!processIsRunning(pid)) {
        return null
      }
      throw new Error(`process birth lookup failed: ${error.message}`)
    }
  }
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })
  if (result.status !== 0 || !result.stdout.trim()) {
    if (!processIsRunning(pid)) {
      return null
    }
    throw new Error(`process birth lookup exited with status ${result.status ?? 'unknown'}`)
  }
  const milliseconds = Date.parse(result.stdout.trim())
  return Number.isFinite(milliseconds) ? String(Math.floor(milliseconds / 1000)) : null
}

function processHasOwnershipToken(pid, token) {
  if (!token || process.platform === 'win32') {
    return true
  }
  if (process.platform === 'linux') {
    try {
      return (
        readFileSync(`/proc/${pid}/cmdline`).includes(Buffer.from(token)) ||
        readFileSync(`/proc/${pid}/environ`).includes(Buffer.from(token))
      )
    } catch (error) {
      if (!processIsRunning(pid)) {
        return false
      }
      throw new Error(`process ownership lookup failed: ${error.message}`)
    }
  }
  const result = spawnSync('ps', ['eww', '-o', 'command=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })
  if (result.error) {
    throw new Error(`process ownership lookup failed: ${result.error.message}`)
  }
  if (result.status !== 0) {
    if (!processIsRunning(pid)) {
      return false
    }
    throw new Error(`process ownership lookup exited with status ${result.status}`)
  }
  return result.stdout.includes(token)
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  if (process.platform === 'win32') {
    const script =
      '$process = Get-Process -Id $args[0] -ErrorAction SilentlyContinue; if ($null -eq $process) { exit 3 }'
    const result = spawnSync(
      windowsPowerShellExecutable(),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, String(pid)],
      { stdio: 'ignore' }
    )
    if (result.error) {
      throw new Error(`process liveness lookup failed: ${result.error.message}`)
    }
    if (result.status === 3) {
      return false
    }
    if (result.status !== 0) {
      throw new Error(`process liveness lookup exited with status ${result.status}`)
    }
    return true
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return false
    }
    if (error?.code === 'EPERM') {
      return true
    }
    throw error
  }
}

function windowsPowerShellExecutable() {
  const systemRoot = process.env.SystemRoot?.trim()
  return systemRoot
    ? join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
}

function sameIdentity(left, right) {
  return (
    left?.pid === right?.pid &&
    left?.birthIdentity === right?.birthIdentity &&
    left?.ownershipToken === right?.ownershipToken
  )
}

function readLease(path) {
  if (!existsSync(path)) {
    return null
  }
  const lease = readJsonRequired(path, 'dev daemon supervisor lease')
  if (!isLease(lease)) {
    throw new Error('dev daemon supervisor lease has an invalid shape')
  }
  return lease
}

function isLease(value) {
  return Boolean(
    value &&
    value.schemaVersion === LEASE_SCHEMA_VERSION &&
    typeof value.leaseId === 'string' &&
    typeof value.createdAtMs === 'number' &&
    isProcessIdentity(value.parent) &&
    (value.guardian === null || isProcessIdentity(value.guardian))
  )
}

function isProcessIdentity(value) {
  return Boolean(
    Number.isInteger(value?.pid) &&
    value.pid > 0 &&
    typeof value.birthIdentity === 'string' &&
    value.birthIdentity.length > 0 &&
    (value.ownershipToken === null ||
      (typeof value.ownershipToken === 'string' && value.ownershipToken.length > 0))
  )
}

async function withTransitionLock(paths, operation) {
  const owner = processIdentity(process.pid)
  const deadline = Date.now() + TRANSITION_LOCK_TIMEOUT_MS
  for (;;) {
    try {
      mkdirSync(paths.transitionLock)
      writeJsonNewDurably(`${paths.transitionLock}/owner.json`, owner)
      break
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }
      const ageMs = Date.now() - statSync(paths.transitionLock).mtimeMs
      const ownerPath = `${paths.transitionLock}/owner.json`
      if (existsSync(ownerPath)) {
        const existing = readJsonRequired(ownerPath, 'dev daemon transition lock')
        if (!isProcessIdentity(existing)) {
          throw new Error('dev daemon transition lock has an invalid owner')
        }
        if (!processMatches(existing)) {
          rmSync(paths.transitionLock, { force: true, recursive: true })
          continue
        }
      } else if (ageMs > TRANSITION_LOCK_STALE_MS) {
        rmSync(paths.transitionLock, { force: true, recursive: true })
        continue
      }
      if (Date.now() >= deadline) {
        throw new Error('dev daemon transition lock timed out')
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  try {
    return await operation()
  } finally {
    rmSync(paths.transitionLock, { force: true, recursive: true })
  }
}

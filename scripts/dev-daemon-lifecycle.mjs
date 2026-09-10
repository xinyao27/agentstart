// Why: the dev supervisor temporarily owns the production daemon integrations, so a detached
// lease holder must restore them even when the foreground package runner exits on Ctrl+C.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, relative } from 'node:path'

import {
  captureOriginalState,
  captureRuntime,
  captureServiceStatus,
  devSupervisorPaths,
  execute,
  installDebugNativeMessaging,
  readPublishedRuntimeIdentity,
  readRestoreState,
  removeDurably,
  restoreNativeMessaging,
  runtimeIdentity,
  sameRuntime,
  writeRestoreState
} from './dev-daemon-installation.mjs'
import {
  captureProcessExecutable,
  menuBarOwnsProcess,
  menuBarRuntimeReady,
  sameExecutable
} from './dev-runtime-process.mjs'
import {
  attachGuardianToLease,
  claimSupervisorLease,
  findProcessIdentityByToken,
  markGuardianRecovering,
  processIdentity,
  processMatches,
  releaseSupervisorLease,
  waitForGuardianReady
} from './dev-supervisor-lease.mjs'

const GUARDIAN_POLL_INTERVAL_MS = 400

export class DevDaemonLifecycle {
  constructor({ daemonBinary, readyTimeoutMs, report, root, stopTimeoutMs, statusPollIntervalMs }) {
    this.daemonBinary = daemonBinary
    this.paths = devSupervisorPaths()
    this.readyTimeoutMs = readyTimeoutMs
    this.report = report
    this.root = root
    this.statusPollIntervalMs = statusPollIntervalMs
    this.stopTimeoutMs = stopTimeoutMs
    this.leaseId = null
    this.parentIdentity = null
    this.guardianExpected = false
  }

  async claimOwnership() {
    const ownership = await claimSupervisorLease(this.paths)
    this.leaseId = ownership.leaseId
    this.parentIdentity = ownership.parent
    this.report.ok(`daemon startup ownership claimed  pid ${process.pid}`)
  }

  async startGuardian() {
    if (!this.leaseId || !this.parentIdentity) {
      throw new Error('daemon dev supervisor ownership is unavailable')
    }
    const child = spawn(
      process.execPath,
      [
        import.meta.filename,
        '--guardian',
        this.leaseId,
        JSON.stringify(this.parentIdentity),
        this.paths.lease,
        this.paths.restore,
        this.paths.transitionLock,
        this.root,
        String(this.stopTimeoutMs),
        String(this.statusPollIntervalMs),
        String(this.readyTimeoutMs)
      ],
      { detached: true, env: process.env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }
    )
    await waitForGuardianReady(child, this.leaseId)
    this.guardianExpected = true
    child.once('exit', (code, signal) => {
      if (!this.guardianExpected) {
        return
      }
      this.report.fail(`daemon recovery guardian exited (${signal ?? code})`)
      process.exitCode = 1
      try {
        process.kill(process.pid, 'SIGTERM')
      } catch {
        // Why: the foreground supervisor is already exiting, so recovery will use its lease.
      }
    })
    child.unref()
    child.channel?.unref()
  }

  async recoverPendingState() {
    if (!existsSync(this.paths.restore)) {
      return true
    }
    this.report.warn('recovering daemon integrations left by an interrupted dev run')
    return restoreDaemonEnvironment({
      readyTimeoutMs: this.readyTimeoutMs,
      report: this.report,
      restoreStatePath: this.paths.restore,
      root: this.root,
      statusPollIntervalMs: this.statusPollIntervalMs,
      stopTimeoutMs: this.stopTimeoutMs
    })
  }

  async takeOverDaemonEnvironment() {
    if (readRestoreState(this.paths.restore)) {
      throw new Error('stale daemon restore state must be recovered before takeover')
    }
    const restore = await captureOriginalState(
      this.daemonBinary,
      this.paths.recoveryBinary,
      this.root
    )
    try {
      writeRestoreState(this.paths.restore, restore)
    } catch (error) {
      removeDurably(restore.recoveryBinary)
      throw error
    }
    installDebugNativeMessaging(this.daemonBinary, this.root)
    this.report.ok(`native messaging → ${relative(this.root, this.daemonBinary)}`)

    if (restore.menuBar) {
      await stopMenuBarRuntime({
        report: this.report,
        restore,
        root: this.root,
        statusPollIntervalMs: this.statusPollIntervalMs,
        stopTimeoutMs: this.stopTimeoutMs
      })
      return
    }
    if (restore.service.state !== 'running') {
      return
    }
    execute(restore.service.executable, ['service', 'stop', '--json'], this.root)
    await waitUntil(
      'installed daemon service shutdown',
      () => {
        const service = captureServiceStatus(restore.recoveryBinary, this.root)
        const current = captureRuntime(restore.recoveryBinary, this.root)
        return (
          service.state === 'stopped' && !runtimeMatchesStatus(current, restore.service.runtime)
        )
      },
      this.stopTimeoutMs,
      this.statusPollIntervalMs
    )
    this.report.ok('installed daemon service stopped')
  }

  recordDebugProcess(pid, ownershipToken) {
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new Error('debug daemon child pid is unavailable')
    }
    const restore = requireRestoreState(this.paths.restore)
    restore.debugRuntime = { ...processIdentity(pid, ownershipToken), runtimeId: null }
    writeRestoreState(this.paths.restore, restore)
  }

  prepareDebugProcess(ownershipToken) {
    if (!ownershipToken) {
      throw new Error('debug daemon ownership token is unavailable')
    }
    const restore = requireRestoreState(this.paths.restore)
    restore.debugRuntime = {
      birthIdentity: null,
      ownershipToken,
      pid: null,
      runtimeId: null
    }
    writeRestoreState(this.paths.restore, restore)
  }

  recordDebugRuntime(status) {
    const identity = runtimeIdentity(status)
    const restore = requireRestoreState(this.paths.restore)
    if (restore.debugRuntime?.pid !== identity.pid) {
      throw new Error('debug daemon runtime does not match its recorded child pid')
    }
    restore.debugRuntime = { ...restore.debugRuntime, ...identity }
    writeRestoreState(this.paths.restore, restore)
  }

  async restore() {
    if (!this.leaseId) {
      return true
    }
    this.guardianExpected = false
    let succeeded = false
    try {
      succeeded = await restoreDaemonEnvironment({
        readyTimeoutMs: this.readyTimeoutMs,
        report: this.report,
        restoreStatePath: this.paths.restore,
        root: this.root,
        statusPollIntervalMs: this.statusPollIntervalMs,
        stopTimeoutMs: this.stopTimeoutMs
      })
    } finally {
      await releaseSupervisorLease(this.paths, this.leaseId)
      this.leaseId = null
    }
    return succeeded
  }
}

async function restoreDaemonEnvironment({
  readyTimeoutMs,
  report,
  restoreStatePath,
  root,
  statusPollIntervalMs,
  stopTimeoutMs
}) {
  let restore
  try {
    restore = readRestoreState(restoreStatePath)
  } catch (error) {
    report.fail(error.message)
    report.warn(`restore state retained → ${restoreStatePath}`)
    return false
  }
  if (!restore) {
    return true
  }
  let succeeded = false
  try {
    succeeded = await stopRecordedDebugRuntime({
      report,
      restore,
      root,
      restoreStatePath,
      stopTimeoutMs
    })
  } catch (error) {
    report.fail(`debug daemon ownership lookup failed: ${error.message}`)
  }

  try {
    restoreNativeMessaging(restore.nativeMessaging)
    report.ok('native messaging registration restored exactly')
  } catch (error) {
    succeeded = false
    report.fail(`native messaging restore failed: ${error.message}`)
  }

  if (succeeded && restore.service.state === 'running') {
    const serviceSucceeded = await restoreRunningService({
      readyTimeoutMs,
      report,
      restore,
      restoreStatePath,
      root,
      statusPollIntervalMs
    })
    succeeded &&= serviceSucceeded
  } else if (succeeded && restore.menuBar) {
    const menuBarSucceeded = await restoreMenuBarRuntime({
      readyTimeoutMs,
      report,
      restore,
      restoreStatePath,
      root,
      statusPollIntervalMs
    })
    succeeded &&= menuBarSucceeded
  }

  if (succeeded) {
    removeDurably(restoreStatePath)
    removeDurably(restore.recoveryBinary)
  } else {
    report.warn(`restore state retained → ${restoreStatePath}`)
  }
  return succeeded
}

async function stopMenuBarRuntime({ report, restore, root, statusPollIntervalMs, stopTimeoutMs }) {
  const menuBar = restore.menuBar
  const current = captureRuntime(restore.recoveryBinary, root, true)
  if (current?.state !== 'running') {
    if (captureProcessExecutable(menuBar.runtime.pid) !== null) {
      throw new Error('the recorded menu bar daemon is live without a published runtime identity')
    }
    return
  }
  if (
    !runtimeMatchesStatus(current, menuBar.runtime) ||
    !menuBarOwnsProcess(menuBar, current, menuBar.hostPid)
  ) {
    throw new Error('an unowned daemon runtime prevents menu bar takeover')
  }
  try {
    process.kill(current.pid, 'SIGTERM')
  } catch {
    throw new Error(`menu bar daemon pid ${current.pid} could not be stopped`)
  }
  await waitUntil(
    'menu bar daemon shutdown',
    () => {
      const candidate = captureRuntime(restore.recoveryBinary, root)
      return (
        !runtimeMatchesStatus(candidate, menuBar.runtime) &&
        captureProcessExecutable(menuBar.runtime.pid) === null
      )
    },
    stopTimeoutMs,
    statusPollIntervalMs
  )
  report.ok(`menu bar daemon stopped  pid ${current.pid}`)
}

async function stopRecordedDebugRuntime({
  report,
  restore,
  root,
  restoreStatePath,
  stopTimeoutMs
}) {
  const debugRuntime = restore.debugRuntime
  if (!debugRuntime) {
    return true
  }
  if (!debugRuntime.pid) {
    const discovered = findProcessIdentityByToken(debugRuntime.ownershipToken)
    if (!discovered) {
      return true
    }
    restore.debugRuntime = { ...discovered, runtimeId: null }
    writeRestoreState(restoreStatePath, restore)
  }
  const ownedDebugRuntime = restore.debugRuntime
  if (!processMatches(ownedDebugRuntime)) {
    return true
  }
  try {
    if (!ownedDebugRuntime.runtimeId) {
      const userData = dirname(dirname(restoreStatePath))
      const published = readPublishedRuntimeIdentity(userData, ownedDebugRuntime.pid)
      if (published) {
        restore.debugRuntime = { ...ownedDebugRuntime, runtimeId: published.runtimeId }
        writeRestoreState(restoreStatePath, restore)
      }
    }
    terminateProcessTree(ownedDebugRuntime.pid)
    await waitUntil(
      'debug daemon shutdown',
      () => !processMatches(ownedDebugRuntime),
      stopTimeoutMs,
      50
    )
    const current = captureRuntime(restore.recoveryBinary, root)
    if (runtimeMatchesStatus(current, restore.debugRuntime)) {
      throw new Error('recorded debug runtime metadata remained live after its process exited')
    }
    report.ok(`debug daemon stopped  pid ${ownedDebugRuntime.pid}`)
    return true
  } catch (error) {
    report.fail(`debug daemon shutdown failed: ${error.message}`)
    return false
  }
}

async function restoreRunningService({
  readyTimeoutMs,
  report,
  restore,
  restoreStatePath,
  root,
  statusPollIntervalMs
}) {
  try {
    const service = captureServiceStatus(restore.recoveryBinary, root)
    if (!sameExecutable(service.executable, restore.service.executable)) {
      throw new Error('installed daemon service executable changed during dev')
    }
    const current = captureRuntime(restore.recoveryBinary, root, true)
    if (current?.state === 'running') {
      if (
        serviceOwnsProcess(service, current, restore.service.executable) &&
        runtimeMatchesStatus(current, restore.service.runtime)
      ) {
        report.ok('installed daemon service remained in its original runtime state')
        return true
      }
      if (
        serviceRuntimeReady(service, current, restore.service.executable) &&
        runtimeMatchesStatus(current, restore.service.restoredRuntime)
      ) {
        report.ok('installed daemon service remained reachable')
        return true
      }
      if (
        restore.service.restorePending &&
        serviceRuntimeReady(service, current, restore.service.executable)
      ) {
        recordRestoredRuntime(restore.service, restore, restoreStatePath, current)
        report.ok('installed daemon service recovery adopted its reachable runtime')
        return true
      }
      throw new Error('an unowned daemon runtime prevents installed service restoration')
    }

    if (service.state !== 'running') {
      restore.service.restorePending = true
      writeRestoreState(restoreStatePath, restore)
      execute(restore.service.executable, ['service', 'start', '--json'], root)
    }
    const restoredRuntime = await waitUntil(
      'installed daemon service identity probe',
      () => {
        const candidateService = captureServiceStatus(restore.recoveryBinary, root)
        const candidate = captureRuntime(restore.recoveryBinary, root, true)
        if (
          serviceRuntimeReady(candidateService, candidate, restore.service.executable) &&
          !runtimeMatchesStatus(candidate, restore.debugRuntime) &&
          !runtimeMatchesStatus(candidate, restore.service.runtime)
        ) {
          return runtimeIdentity(candidate)
        }
        return null
      },
      readyTimeoutMs,
      statusPollIntervalMs
    )
    recordRestoredRuntime(restore.service, restore, restoreStatePath, restoredRuntime)
    report.ok('installed daemon service restored with a new reachable runtime')
    return true
  } catch (error) {
    report.fail(`installed daemon service restore failed: ${error.message}`)
    return false
  }
}

async function restoreMenuBarRuntime({
  readyTimeoutMs,
  report,
  restore,
  restoreStatePath,
  root,
  statusPollIntervalMs
}) {
  const menuBar = restore.menuBar
  try {
    const current = captureRuntime(restore.recoveryBinary, root, true)
    if (current?.state === 'running') {
      if (menuBarOwnsProcess(menuBar, current) && runtimeMatchesStatus(current, menuBar.runtime)) {
        report.ok('menu bar daemon remained in its original runtime state')
        return true
      }
      if (
        menuBarRuntimeReady(menuBar, current) &&
        runtimeMatchesStatus(current, menuBar.restoredRuntime)
      ) {
        report.ok('menu bar daemon remained reachable')
        return true
      }
      if (menuBar.restorePending && menuBarRuntimeReady(menuBar, current)) {
        recordRestoredRuntime(menuBar, restore, restoreStatePath, current)
        report.ok('menu bar daemon recovery adopted its reachable runtime')
        return true
      }
      throw new Error('an unowned daemon runtime prevents menu bar restoration')
    }

    menuBar.restorePending = true
    writeRestoreState(restoreStatePath, restore)
    execute('/usr/bin/open', ['-g', menuBar.appBundle], root)
    const restoredRuntime = await waitUntil(
      'menu bar daemon identity probe',
      () => {
        const candidate = captureRuntime(restore.recoveryBinary, root, true)
        if (
          menuBarRuntimeReady(menuBar, candidate) &&
          !runtimeMatchesStatus(candidate, restore.debugRuntime) &&
          !runtimeMatchesStatus(candidate, menuBar.runtime)
        ) {
          return runtimeIdentity(candidate)
        }
        return null
      },
      readyTimeoutMs,
      statusPollIntervalMs
    )
    recordRestoredRuntime(menuBar, restore, restoreStatePath, restoredRuntime)
    report.ok('menu bar daemon restored with a new reachable runtime')
    return true
  } catch (error) {
    report.fail(`menu bar daemon restore failed: ${error.message}`)
    return false
  }
}

function requireRestoreState(path) {
  const restore = readRestoreState(path)
  if (!restore) {
    throw new Error('dev daemon restore state is unavailable')
  }
  return restore
}

function runtimeMatchesStatus(status, identity) {
  return Boolean(
    status?.state === 'running' &&
    identity?.runtimeId &&
    sameRuntime({ pid: status.pid, runtimeId: status.runtimeId }, identity)
  )
}

function hasRuntimeIdentity(status) {
  return (
    Number.isInteger(status?.pid) &&
    status.pid > 0 &&
    typeof status.runtimeId === 'string' &&
    status.runtimeId.length > 0
  )
}

function recordRestoredRuntime(owner, restore, restoreStatePath, status) {
  owner.restorePending = false
  owner.restoredRuntime = runtimeIdentity(status)
  writeRestoreState(restoreStatePath, restore)
}

function serviceOwnsProcess(service, runtime, expectedExecutable) {
  return Boolean(
    service.state === 'running' &&
    service.pid &&
    hasRuntimeIdentity(runtime) &&
    service.pid === runtime.pid &&
    sameExecutable(service.executable, expectedExecutable) &&
    sameExecutable(captureProcessExecutable(service.pid), expectedExecutable)
  )
}

function serviceRuntimeReady(service, runtime, expectedExecutable) {
  return runtime?.reachable === true && serviceOwnsProcess(service, runtime, expectedExecutable)
}

function terminateProcessTree(pid) {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
    if (result.error || result.status !== 0) {
      throw new Error(`debug daemon pid ${pid} could not be stopped`)
    }
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    throw new Error(`debug daemon pid ${pid} could not be stopped`)
  }
}

async function waitUntil(label, ready, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const result = ready()
    if (result) {
      return result
    }
    if (Date.now() >= deadline) {
      throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)}s`)
    }
    await delay(intervalMs)
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function runGuardian() {
  const [
    ,
    ,
    ,
    leaseId,
    parentText,
    leasePath,
    restoreStatePath,
    transitionLock,
    root,
    stopTimeoutText,
    pollText,
    readyTimeoutText
  ] = process.argv
  const parent = JSON.parse(parentText)
  const paths = { lease: leasePath, transitionLock }
  const guardian = await attachGuardianToLease(paths, leaseId, parent)
  process.send?.({ leaseId, type: 'ready' })
  process.disconnect?.()
  while (processMatches(parent)) {
    await delay(GUARDIAN_POLL_INTERVAL_MS)
  }
  if (!(await markGuardianRecovering(paths, leaseId, guardian))) {
    return
  }

  console.error('\n! dev supervisor exited before cleanup; recovering daemon ownership')
  const report = {
    fail: (message) => console.error(`✗ ${message}`),
    ok: (message) => console.log(`✓ ${message}`),
    warn: (message) => console.warn(`! ${message}`)
  }
  const succeeded = await restoreDaemonEnvironment({
    readyTimeoutMs: Number(readyTimeoutText),
    report,
    restoreStatePath,
    root,
    statusPollIntervalMs: Number(pollText),
    stopTimeoutMs: Number(stopTimeoutText)
  })
  await releaseSupervisorLease(paths, leaseId)
  if (!succeeded) {
    process.exitCode = 1
  }
}

if (process.argv[1] === import.meta.filename && process.argv[2] === '--guardian') {
  await runGuardian()
}

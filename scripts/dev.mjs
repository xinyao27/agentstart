#!/usr/bin/env node
// Why: a working dev state needs four effects no package task can express. Protobuf bindings must
// exist before cargo compiles; Chrome's Native Messaging manifest points at the installed release
// binary, so the extension bootstraps into that daemon instead of the debug one; the debug daemon
// exits silently when another runtime already holds the user-data lock; and WXT writes the unpacked
// directory only after its first build, so the load-unpacked instruction cannot be printed up front.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, watch } from 'node:fs'
import { join, relative } from 'node:path'

import { DevDaemonLifecycle } from './dev-daemon-lifecycle.mjs'

const ROOT = join(import.meta.dirname, '..')
const DAEMON_ROOT = join(ROOT, 'apps', 'daemon')
const DAEMON_BINARY = join(
  DAEMON_ROOT,
  'target',
  'debug',
  process.platform === 'win32' ? 'agentstart.exe' : 'agentstart'
)
const EXTENSION_OUTPUT = join(ROOT, 'apps', 'extension', '.output', 'chrome-mv3-dev')
const EXTENSION_MANIFEST = join(EXTENSION_OUTPUT, 'manifest.json')
const PROTOCOL_SCHEMA_ROOT = join(ROOT, 'packages', 'protocol', 'proto')
const VP = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'vp.cmd' : 'vp')
const DAEMON_READY_TIMEOUT_MS = 30_000
const DAEMON_STOP_TIMEOUT_MS = 10_000
const EXTENSION_READY_TIMEOUT_MS = 300_000
const STATUS_POLL_INTERVAL_MS = 400
const FILE_POLL_INTERVAL_MS = 150
const REBUILD_DEBOUNCE_MS = 300
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR

let daemonChild = null
let extensionChild = null
let shuttingDown = false
let rebuildTimer = null
let rebuildInFlight = false
let rebuildQueued = false
let protocolSchemaDirty = false

function paint(code, text) {
  return COLOR ? `\u001B[${code}m${text}\u001B[0m` : text
}

function ok(message) {
  console.log(`${paint('32', '✓')} ${message}`)
}

function note(message) {
  console.log(`${paint('2', '·')} ${paint('2', message)}`)
}

function warn(message) {
  console.warn(`${paint('33', '!')} ${message}`)
}

function fail(message) {
  console.error(`${paint('31', '✗')} ${message}`)
}

const daemonLifecycle = new DevDaemonLifecycle({
  daemonBinary: DAEMON_BINARY,
  readyTimeoutMs: DAEMON_READY_TIMEOUT_MS,
  report: { fail, note, ok, warn },
  root: ROOT,
  statusPollIntervalMs: STATUS_POLL_INTERVAL_MS,
  stopTimeoutMs: DAEMON_STOP_TIMEOUT_MS
})

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    ...options
  })
  if (result.error) {
    throw new Error(`${command} could not start: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`)
  }
}

function vitePlusInvocation(args) {
  if (process.platform !== 'win32') {
    return { args, command: VP }
  }
  return {
    args: ['/d', '/s', '/c', 'call', VP, ...args],
    command: process.env.ComSpec?.trim() || 'cmd.exe'
  }
}

function captureJson(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  if (result.error || result.status !== 0) {
    return null
  }
  for (const line of result.stdout.split('\n').toReversed()) {
    const trimmed = line.trim()
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed)
      } catch {
        return null
      }
    }
  }
  return null
}

async function waitUntil(label, ready, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = ready()
    if (value) {
      return value
    }
    if (Date.now() >= deadline) {
      throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)}s`)
    }
    await delay(intervalMs)
  }
}

function buildProtocolBindings() {
  const invocation = vitePlusInvocation(['run', '--filter', '@agentstart/daemon^...', 'build'])
  execute(invocation.command, invocation.args)
  ok('protocol bindings built')
}

function buildDaemon() {
  execute('cargo', ['build', '--locked'], { cwd: DAEMON_ROOT })
  ok(`daemon built  ${relative(ROOT, DAEMON_BINARY)}`)
}

// Why: the extension task reaches WXT through `vp run`, so signalling the direct child leaves WXT
// holding port 3100 and the next run dies on `strictPort`. Each child owns a process group, and the
// group is what gets signalled.
function spawnGroup(command, args, env = process.env) {
  return spawn(command, args, { cwd: ROOT, detached: true, env, stdio: 'inherit' })
}

function killGroup(child, signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
    return
  }
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
      return
    }
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // Why: the group is already gone, which is the outcome the caller wanted.
    }
  }
}

function superviseChild(child, label) {
  child.on('error', (error) => {
    if (shuttingDown) {
      return
    }
    fail(`${label} could not start: ${error.message}`)
    void shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }
    fail(`${label} exited (${signal ?? code})`)
    void shutdown(1)
  })
}

async function startDaemon() {
  const ownershipToken = randomUUID()
  daemonLifecycle.prepareDebugProcess(ownershipToken)
  const child = spawnGroup(DAEMON_BINARY, ['daemon', '--dev-supervisor-token', ownershipToken], {
    ...process.env,
    AGENTSTART_DEV_RUNTIME_TOKEN: ownershipToken
  })
  daemonChild = child
  daemonLifecycle.recordDebugProcess(child.pid, ownershipToken)
  superviseChild(child, 'daemon')
  const status = await waitUntil(
    'daemon',
    () => {
      const current = captureJson(DAEMON_BINARY, ['status', '--json'])
      return current?.state === 'running' && current.pid === child.pid ? current : null
    },
    DAEMON_READY_TIMEOUT_MS,
    STATUS_POLL_INTERVAL_MS
  )
  daemonLifecycle.recordDebugRuntime(status)
  ok(`daemon listening  ${status.endpoint}`)
}

async function stopDaemonChild() {
  const child = daemonChild
  daemonChild = null
  await stopChild(child)
}

function startExtension() {
  const invocation = vitePlusInvocation(['run', '@agentstart/extension#dev'])
  extensionChild = spawnGroup(invocation.command, invocation.args)
  superviseChild(extensionChild, 'extension dev server')
}

function manifestStamp() {
  try {
    return statSync(EXTENSION_MANIFEST).mtimeMs
  } catch {
    return 0
  }
}

function copyToClipboard(text) {
  const commands =
    process.platform === 'darwin'
      ? [['pbcopy', []]]
      : process.platform === 'win32'
        ? [['clip', []]]
        : [
            ['wl-copy', []],
            ['xclip', ['-selection', 'clipboard']]
          ]
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { input: text, stdio: ['pipe', 'ignore', 'ignore'] })
    if (!result.error && result.status === 0) {
      return true
    }
  }
  return false
}

function pickerPathHint() {
  if (process.platform === 'darwin') {
    return 'press ⌘⇧G and paste (⌘⇧. also reveals hidden entries)'
  }
  if (process.platform === 'win32') {
    return 'paste the path into the picker’s address bar'
  }
  return 'press Ctrl+L and paste (Ctrl+H also reveals hidden entries)'
}

async function announceExtension(previousStamp) {
  await waitUntil(
    'extension dev build',
    () => manifestStamp() > previousStamp,
    EXTENSION_READY_TIMEOUT_MS,
    FILE_POLL_INTERVAL_MS
  )
  ok(`wxt dev  →  ${relative(ROOT, EXTENSION_OUTPUT)}`)
  const shortcut = process.platform === 'darwin' ? '⌘⇧Y' : 'Ctrl+Shift+Y'
  const copied = copyToClipboard(EXTENSION_OUTPUT)
  console.log('')
  console.log(`  ${paint('1', 'First run only:')}`)
  console.log('  1. open chrome://extensions  (Developer mode on)')
  console.log(`  2. Load unpacked → ${copied ? 'path copied to clipboard' : EXTENSION_OUTPUT}`)
  // Why: the output lives under a dot-directory, which every platform's file picker hides by
  // default, so the path has to be typed rather than clicked to.
  console.log(`     ${paint('2', `the picker hides .output — ${pickerPathHint()}`)}`)
  console.log(`  3. ${shortcut} opens the side panel`)
  console.log('')
  note('watching daemon + extension… press Ctrl+C to stop')
}

async function rebuildDaemon() {
  if (shuttingDown) {
    return
  }
  if (rebuildInFlight) {
    rebuildQueued = true
    return
  }
  rebuildInFlight = true
  try {
    do {
      rebuildQueued = false
      console.log('')
      note('daemon sources changed, rebuilding…')
      // Why: Unix can replace an executing binary, so keep the live daemon authoritative until a
      // successful build is ready. Windows must release the executable before Cargo can replace it.
      if (process.platform === 'win32') {
        await stopDaemonChild()
        if (shuttingDown) {
          return
        }
      }
      if (protocolSchemaDirty) {
        buildProtocolBindings()
        protocolSchemaDirty = false
      }
      buildDaemon()
    } while (rebuildQueued)
    if (shuttingDown) {
      return
    }
    await stopDaemonChild()
    if (shuttingDown) {
      return
    }
    await startDaemon()
    note('watching daemon + extension… press Ctrl+C to stop')
  } catch (error) {
    fail(`daemon rebuild failed: ${error.message}`)
    note('fix the error and save again')
  } finally {
    rebuildInFlight = false
  }
}

function watchDaemonSources() {
  const targets = [
    { isProtocolSchema: false, path: join(DAEMON_ROOT, 'src') },
    { isProtocolSchema: false, path: join(DAEMON_ROOT, 'Cargo.toml') },
    { isProtocolSchema: true, path: PROTOCOL_SCHEMA_ROOT }
  ].map((target) => ({ ...target, fingerprint: sourceFingerprint(target.path) }))
  for (const target of targets) {
    if (!existsSync(target.path)) {
      continue
    }
    const watcher = watch(target.path, { recursive: true }, () => {
      if (shuttingDown) {
        return
      }
      clearTimeout(rebuildTimer)
      rebuildTimer = setTimeout(() => {
        try {
          let sourceChanged = false
          for (const candidate of targets) {
            const fingerprint = sourceFingerprint(candidate.path)
            if (fingerprint === candidate.fingerprint) {
              continue
            }
            candidate.fingerprint = fingerprint
            protocolSchemaDirty ||= candidate.isProtocolSchema
            sourceChanged = true
          }
          if (sourceChanged) {
            void rebuildDaemon()
          }
        } catch (error) {
          fail(`daemon source watch failed: ${error.message}`)
          void shutdown(1)
        }
      }, REBUILD_DEBOUNCE_MS)
    })
    watcher.unref()
  }
}

// Why: macOS FSEvents can report directory activity without a source write. Comparing bytes keeps
// runtime reads and historical events from restarting the daemon and invalidating live endpoints.
function sourceFingerprint(path) {
  const hash = createHash('sha256')
  appendSource(hash, path)
  return hash.digest('hex')
}

function appendSource(hash, path) {
  try {
    const status = statSync(path)
    if (status.isFile()) {
      hash.update(path)
      hash.update(readFileSync(path))
      return
    }
    for (const entry of readdirSync(path, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      if (entry.isDirectory() || entry.isFile()) {
        appendSource(hash, join(path, entry.name))
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
    hash.update(`${path}:missing`)
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }
  await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(forceKill)
      resolve()
    }
    child.removeAllListeners('exit')
    child.once('close', finish)
    const forceKill = setTimeout(() => killGroup(child, 'SIGKILL'), DAEMON_STOP_TIMEOUT_MS)
    killGroup(child, 'SIGTERM')
    if (child.exitCode !== null || child.signalCode !== null) {
      finish()
    }
  })
}

async function shutdown(code) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  clearTimeout(rebuildTimer)
  rebuildTimer = null
  console.log('')
  await Promise.all([stopChild(daemonChild), stopChild(extensionChild)])
  let exitCode = code
  if (!(await daemonLifecycle.restore())) {
    exitCode = 1
  }
  exitCode = Math.max(exitCode, process.exitCode || 0)
  process.exit(exitCode)
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(process.exitCode || 0))
if (process.platform !== 'win32') {
  process.on('SIGHUP', () => void shutdown(0))
  process.on('SIGQUIT', () => void shutdown(0))
}

async function main() {
  await daemonLifecycle.claimOwnership()
  await daemonLifecycle.startGuardian()
  if (!(await daemonLifecycle.recoverPendingState())) {
    throw new Error('previous daemon integrations could not be recovered')
  }
  buildProtocolBindings()
  buildDaemon()
  await daemonLifecycle.takeOverDaemonEnvironment()
  await startDaemon()
  const previousStamp = manifestStamp()
  startExtension()
  await announceExtension(previousStamp)
  watchDaemonSources()
}

main().catch((error) => {
  fail(error.message)
  void shutdown(1)
})

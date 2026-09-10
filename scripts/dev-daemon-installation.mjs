// Why: dev temporarily mutates two independent machine integrations, so their exact pre-dev
// state must survive parent death without coupling Native Messaging to the daemon service.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  captureMacOSMenuBarRuntime,
  captureProcessExecutable,
  sameExecutable,
  waitForOriginalRuntimePublication
} from './dev-runtime-process.mjs'

export { captureProcessExecutable } from './dev-runtime-process.mjs'

const NATIVE_HOST_MANIFEST_NAME = 'com.agentstart.daemon.json'
const WINDOWS_NATIVE_HOST_KEY =
  'Software\\Google\\Chrome\\NativeMessagingHosts\\com.agentstart.daemon'
const RESTORE_SCHEMA_VERSION = 2

export function devSupervisorPaths() {
  const userData = daemonUserDataPath()
  const directory = join(userData, 'dev-daemon-supervisor')
  return {
    directory,
    lease: join(directory, 'lease.json'),
    recoveryBinary: join(
      directory,
      process.platform === 'win32' ? 'recovery-daemon.exe' : 'recovery-daemon'
    ),
    restore: join(directory, 'restore.json'),
    transitionLock: join(directory, 'transition.lock'),
    userData
  }
}

export function readPublishedRuntimeIdentity(userData, pid) {
  const path = join(userData, 'rh', String(pid), 'extension-bootstrap.json')
  try {
    const stored = JSON.parse(readFileSync(path, 'utf8'))
    return runtimeIdentity({ pid, runtimeId: stored.runtimeId })
  } catch {
    return null
  }
}

export async function captureOriginalState(daemonBinary, recoveryBinary, root) {
  copyExecutableDurably(daemonBinary, recoveryBinary)
  try {
    const nativeMessaging = captureNativeMessaging()
    const service = captureServiceStatus(recoveryBinary, root)
    let current = captureRuntime(recoveryBinary, root, true)
    if (current?.state !== 'running') {
      const expectedDaemon = nativeMessaging.manifest.existed
        ? nativeMessagingExecutable(nativeMessaging)
        : null
      if (expectedDaemon) {
        current = await waitForOriginalRuntimePublication({
          expectedDaemon,
          readRuntime: () => captureRuntime(recoveryBinary, root, true),
          service
        })
      }
    }
    let runtime = null
    let menuBar = null
    if (service.state === 'running') {
      if (current?.state !== 'running') {
        throw new Error('running installed daemon service has no published runtime identity')
      }
      if (
        !service.pid ||
        current.pid !== service.pid ||
        !sameExecutable(captureProcessExecutable(service.pid), service.executable)
      ) {
        throw new Error('running daemon runtime is not owned by the installed service')
      }
      runtime = runtimeIdentity(current)
    } else if (current?.state === 'running') {
      menuBar = captureMacOSMenuBarRuntime(current, nativeMessagingExecutable(nativeMessaging))
    }
    return {
      debugRuntime: null,
      menuBar,
      nativeMessaging,
      platform: process.platform,
      recoveryBinary,
      schemaVersion: RESTORE_SCHEMA_VERSION,
      service: { ...service, restorePending: false, restoredRuntime: null, runtime }
    }
  } catch (error) {
    removeDurably(recoveryBinary)
    throw error
  }
}

export function captureRuntime(binary, root, probe = false) {
  return captureJson(binary, ['status', '--json', ...(probe ? ['--probe'] : [])], root)
}

export function captureServiceStatus(binary, root) {
  const status = captureJson(binary, ['service', 'status', '--json'], root)
  if (!status || !['not_installed', 'running', 'stopped'].includes(status.state)) {
    throw new Error('installed daemon service status is unavailable')
  }
  const executable = typeof status.executable === 'string' ? status.executable.trim() : ''
  if (status.state !== 'not_installed' && !executable) {
    throw new Error('installed daemon service executable is unavailable')
  }
  const pid = Number.isInteger(status.pid) && status.pid > 0 ? status.pid : null
  return { executable: executable || null, pid, state: status.state }
}

export function execute(command, args, root) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'ignore'
  })
  if (result.error) {
    throw new Error(`${command} could not start: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`)
  }
}

export function installDebugNativeMessaging(daemonBinary, root) {
  execute(daemonBinary, ['native-messaging', 'install', '--silent'], root)
}

export function restoreNativeMessaging(snapshot) {
  restoreFileSnapshot(snapshot.manifest)
  if (process.platform === 'win32') {
    restoreWindowsRegistry(snapshot.registry)
  }
}

export function readRestoreState(path) {
  if (!existsSync(path)) {
    return null
  }
  let stored
  try {
    stored = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`dev daemon restore state is unreadable: ${error.message}`)
  }
  if (!isRestoreState(stored)) {
    throw new Error('dev daemon restore state has an unsupported or invalid shape')
  }
  return stored
}

export function writeRestoreState(path, state) {
  writeFileDurably(path, Buffer.from(`${JSON.stringify(state)}\n`), 0o600)
}

export function removeDurably(path) {
  rmSync(path, { force: true })
  const parent = dirname(path)
  if (existsSync(parent)) {
    syncDirectory(parent)
  }
}

export function writeJsonNewDurably(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  const descriptor = openSync(temporaryPath, 'wx', 0o600)
  try {
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  try {
    linkSync(temporaryPath, path)
    syncDirectory(dirname(path))
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

export function writeJsonDurably(path, value) {
  writeFileDurably(path, Buffer.from(`${JSON.stringify(value)}\n`), 0o600)
}

export function readJsonRequired(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`)
  }
}

export function runtimeIdentity(status) {
  if (
    typeof status?.pid !== 'number' ||
    !Number.isInteger(status.pid) ||
    status.pid <= 0 ||
    typeof status.runtimeId !== 'string' ||
    !status.runtimeId
  ) {
    throw new Error('daemon runtime identity is unavailable')
  }
  return { pid: status.pid, runtimeId: status.runtimeId }
}

export function sameRuntime(left, right) {
  return Boolean(left && right && left.pid === right.pid && left.runtimeId === right.runtimeId)
}

function captureJson(command, args, root) {
  const result = spawnSync(command, args, {
    cwd: root,
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

function captureNativeMessaging() {
  const manifestPath = nativeHostManifestPath()
  return {
    manifest: captureFileSnapshot(manifestPath),
    registry: process.platform === 'win32' ? captureWindowsRegistry() : null
  }
}

function nativeMessagingExecutable(nativeMessaging) {
  const snapshot = nativeMessaging.manifest
  if (!snapshot.existed || typeof snapshot.contentsBase64 !== 'string') {
    throw new Error('the original Native Messaging manifest cannot identify the running daemon')
  }
  let manifest
  try {
    manifest = JSON.parse(Buffer.from(snapshot.contentsBase64, 'base64').toString('utf8'))
  } catch (error) {
    throw new Error(`the original Native Messaging manifest is unreadable: ${error.message}`)
  }
  if (typeof manifest.path !== 'string' || !manifest.path.trim()) {
    throw new Error('the original Native Messaging manifest has no executable path')
  }
  return manifest.path.trim()
}

function captureFileSnapshot(path) {
  const parent = capturePathMetadata(dirname(path))
  if (!existsSync(path)) {
    return { contentsBase64: null, existed: false, mode: null, parent, path, windowsSddl: null }
  }
  const status = statSync(path)
  if (!status.isFile()) {
    throw new Error(`native messaging manifest is not a file: ${path}`)
  }
  return {
    contentsBase64: readFileSync(path).toString('base64'),
    existed: true,
    mode: process.platform === 'win32' ? null : status.mode & 0o777,
    parent,
    path,
    windowsSddl: process.platform === 'win32' ? captureWindowsAcl(path) : null
  }
}

function restoreFileSnapshot(snapshot) {
  if (!snapshot.existed) {
    removeDurably(snapshot.path)
  } else {
    writeFileDurably(snapshot.path, Buffer.from(snapshot.contentsBase64, 'base64'), snapshot.mode)
    restorePathMetadata(snapshot.path, snapshot.mode, snapshot.windowsSddl)
  }
  restoreParentMetadata(snapshot.parent)
}

function capturePathMetadata(path) {
  if (!existsSync(path)) {
    return { existed: false, mode: null, path, windowsSddl: null }
  }
  const status = statSync(path)
  if (!status.isDirectory()) {
    throw new Error(`native messaging manifest parent is not a directory: ${path}`)
  }
  return {
    existed: true,
    mode: process.platform === 'win32' ? null : status.mode & 0o777,
    path,
    windowsSddl: process.platform === 'win32' ? captureWindowsAcl(path) : null
  }
}

function restoreParentMetadata(parent) {
  if (parent.existed) {
    restorePathMetadata(parent.path, parent.mode, parent.windowsSddl)
    return
  }
  try {
    rmSync(parent.path)
    syncDirectory(dirname(parent.path))
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error?.code)) {
      throw error
    }
  }
}

function restorePathMetadata(path, mode, windowsSddl) {
  if (process.platform === 'win32') {
    restoreWindowsAcl(path, windowsSddl)
  } else {
    chmodSync(path, mode)
  }
}

function captureWindowsAcl(path) {
  const script =
    '$acl = Get-Acl -LiteralPath $args[0]; [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($acl.Sddl))'
  const encoded = capturePowerShell(script, [path])
  if (!encoded) {
    throw new Error(`Windows ACL is unavailable: ${path}`)
  }
  return encoded
}

function restoreWindowsAcl(path, encodedSddl) {
  const script =
    '$sddl = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($args[1])); $acl = Get-Acl -LiteralPath $args[0]; $acl.SetSecurityDescriptorSddlForm($sddl); Set-Acl -LiteralPath $args[0] -AclObject $acl'
  capturePowerShell(script, [path, encodedSddl])
}

function captureWindowsRegistry() {
  const script =
    "$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($args[0]); if ($null -eq $key) { @{ keyExisted = $false; valueBase64 = $null; valueExisted = $false; valueKind = $null } | ConvertTo-Json -Compress; exit 0 }; $names = @($key.GetValueNames()); $hasValue = $names -contains ''; $value = if ($hasValue) { [string]$key.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } else { $null }; $kind = if ($hasValue) { [string]$key.GetValueKind('') } else { $null }; @{ keyExisted = $true; valueBase64 = if ($hasValue) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value)) } else { $null }; valueExisted = $hasValue; valueKind = $kind } | ConvertTo-Json -Compress; $key.Dispose()"
  const output = capturePowerShell(script, [WINDOWS_NATIVE_HOST_KEY])
  const registry = JSON.parse(output)
  if (
    typeof registry.keyExisted !== 'boolean' ||
    typeof registry.valueExisted !== 'boolean' ||
    (registry.valueExisted &&
      (typeof registry.valueBase64 !== 'string' ||
        !['ExpandString', 'String'].includes(registry.valueKind)))
  ) {
    throw new Error('native messaging registry state is invalid')
  }
  return registry
}

function restoreWindowsRegistry(registry) {
  const script =
    "$keyPath = $args[0]; if ($args[1] -eq 'false') { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($keyPath, $false); exit 0 }; $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($keyPath); if ($args[2] -eq 'false') { $key.DeleteValue('', $false) } else { $value = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($args[3])); $kind = [Enum]::Parse([Microsoft.Win32.RegistryValueKind], $args[4]); $key.SetValue('', $value, $kind) }; $key.Dispose()"
  capturePowerShell(script, [
    WINDOWS_NATIVE_HOST_KEY,
    String(registry.keyExisted),
    String(registry.valueExisted),
    registry.valueBase64 ?? '',
    registry.valueKind ?? 'String'
  ])
}

function capturePowerShell(script, args) {
  const executable = windowsSystemExecutable(join('WindowsPowerShell', 'v1.0', 'powershell.exe'))
  const result = spawnSync(
    executable,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); ${script}`,
      ...args
    ],
    { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  if (result.error) {
    throw new Error(`PowerShell could not start: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`PowerShell exited with status ${result.status ?? 'unknown'}`)
  }
  return result.stdout.trim()
}

function writeFileDurably(path, contents, mode) {
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  let descriptor
  try {
    descriptor = openSync(temporaryPath, 'wx', mode ?? 0o600)
    writeFileSync(descriptor, contents)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporaryPath, path)
    syncDirectory(dirname(path))
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor)
    }
    rmSync(temporaryPath, { force: true })
  }
}

function copyExecutableDurably(source, destination) {
  mkdirSync(dirname(destination), { recursive: true })
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`
  let descriptor
  try {
    copyFileSync(source, temporaryPath)
    if (process.platform !== 'win32') {
      chmodSync(temporaryPath, 0o700)
    }
    descriptor = openSync(temporaryPath, 'r')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporaryPath, destination)
    syncDirectory(dirname(destination))
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor)
    }
    rmSync(temporaryPath, { force: true })
  }
}

function syncDirectory(path) {
  if (process.platform === 'win32') {
    return
  }
  const descriptor = openSync(path, 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function nativeHostManifestPath() {
  const configuredRoot = process.env.AGENTSTART_NATIVE_MESSAGING_CONFIG_ROOT?.trim()
  if (configuredRoot) {
    return join(configuredRoot, NATIVE_HOST_MANIFEST_NAME)
  }
  if (process.platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      NATIVE_HOST_MANIFEST_NAME
    )
  }
  if (process.platform === 'win32') {
    const appData = process.env.LOCALAPPDATA?.trim() || process.env.APPDATA?.trim()
    if (!appData) {
      throw new Error('LOCALAPPDATA and APPDATA are unavailable for Native Messaging')
    }
    return join(appData, 'AgentStart', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME)
  }
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
  return join(configHome, 'google-chrome', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME)
}

function daemonUserDataPath() {
  const configuredRoot =
    process.env.AGENTSTART_APP_USER_DATA_PATH?.trim() ||
    process.env.AGENTSTART_USER_DATA_PATH?.trim()
  if (configuredRoot) {
    return configuredRoot
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'agentstart')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim()
    if (!appData) {
      throw new Error('APPDATA is unavailable for daemon dev supervision')
    }
    return join(appData, 'agentstart')
  }
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
  return join(configHome, 'agentstart')
}

function windowsSystemExecutable(path) {
  const systemRoot = process.env.SystemRoot?.trim()
  return systemRoot ? join(systemRoot, 'System32', path) : path
}

function isRestoreState(value) {
  return Boolean(
    value &&
    [1, RESTORE_SCHEMA_VERSION].includes(value.schemaVersion) &&
    value.platform === process.platform &&
    typeof value.recoveryBinary === 'string' &&
    value.recoveryBinary.length > 0 &&
    isDebugRuntime(value.debugRuntime) &&
    isMenuBarState(value.menuBar ?? null) &&
    isNativeMessagingState(value.nativeMessaging) &&
    isServiceState(value.service)
  )
}

function isMenuBarState(value) {
  return (
    value === null ||
    (process.platform === 'darwin' &&
      typeof value?.appBundle === 'string' &&
      value.appBundle.length > 0 &&
      typeof value.daemonExecutable === 'string' &&
      value.daemonExecutable.length > 0 &&
      typeof value.hostExecutable === 'string' &&
      value.hostExecutable.length > 0 &&
      Number.isInteger(value.hostPid) &&
      value.hostPid > 0 &&
      typeof value.restorePending === 'boolean' &&
      isRuntimeIdentity(value.runtime) &&
      (value.restoredRuntime === null || isRuntimeIdentity(value.restoredRuntime)))
  )
}

function isRuntimeIdentity(value) {
  return Boolean(
    Number.isInteger(value?.pid) &&
    value.pid > 0 &&
    typeof value.runtimeId === 'string' &&
    value.runtimeId.length > 0
  )
}

function isDebugRuntime(value) {
  return (
    value === null ||
    (((value?.pid === null && value.birthIdentity === null) ||
      (Number.isInteger(value?.pid) &&
        value.pid > 0 &&
        typeof value.birthIdentity === 'string' &&
        value.birthIdentity.length > 0)) &&
      typeof value.ownershipToken === 'string' &&
      value.ownershipToken.length > 0 &&
      (value.runtimeId === null ||
        (typeof value.runtimeId === 'string' && value.runtimeId.length > 0)))
  )
}

function isNativeMessagingState(value) {
  const manifest = value?.manifest
  const registry = value?.registry
  return Boolean(
    manifest &&
    typeof manifest.path === 'string' &&
    typeof manifest.existed === 'boolean' &&
    isPathMetadata(manifest.parent) &&
    (manifest.existed
      ? typeof manifest.contentsBase64 === 'string'
      : manifest.contentsBase64 === null) &&
    (manifest.mode === null ||
      (Number.isInteger(manifest.mode) && manifest.mode >= 0 && manifest.mode <= 0o777)) &&
    (process.platform === 'win32'
      ? !manifest.existed || typeof manifest.windowsSddl === 'string'
      : manifest.windowsSddl === null) &&
    (process.platform === 'win32'
      ? typeof registry?.keyExisted === 'boolean' &&
        typeof registry?.valueExisted === 'boolean' &&
        (!registry.valueExisted ||
          (typeof registry.valueBase64 === 'string' &&
            ['ExpandString', 'String'].includes(registry.valueKind)))
      : registry === null)
  )
}

function isPathMetadata(value) {
  return Boolean(
    value &&
    typeof value.path === 'string' &&
    typeof value.existed === 'boolean' &&
    (value.mode === null ||
      (Number.isInteger(value.mode) && value.mode >= 0 && value.mode <= 0o777)) &&
    (process.platform === 'win32'
      ? !value.existed || typeof value.windowsSddl === 'string'
      : value.windowsSddl === null)
  )
}

function isServiceState(value) {
  return Boolean(
    value &&
    ['not_installed', 'running', 'stopped'].includes(value.state) &&
    (value.state === 'not_installed'
      ? value.executable === null
      : typeof value.executable === 'string' && value.executable.length > 0) &&
    (value.state === 'running'
      ? Number.isInteger(value.pid) && value.pid > 0
      : value.pid === null) &&
    typeof value.restorePending === 'boolean' &&
    (value.state === 'running'
      ? Number.isInteger(value.runtime?.pid) &&
        value.runtime.pid > 0 &&
        typeof value.runtime.runtimeId === 'string' &&
        value.runtime.runtimeId.length > 0
      : value.runtime === null) &&
    (value.restoredRuntime === null ||
      (Number.isInteger(value.restoredRuntime?.pid) &&
        value.restoredRuntime.pid > 0 &&
        typeof value.restoredRuntime.runtimeId === 'string' &&
        value.restoredRuntime.runtimeId.length > 0))
  )
}

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import {
  captureManagedDirectory,
  capturePathState,
  pathExists,
  restoreManagedDirectory,
  restorePathState,
  syncDirectory
} from './filesystem-state.mjs'

const COMMAND_DEADLINE_MS = 30_000
const SERVICE_LABEL = 'com.yiru.daemon'
const SYSTEMD_UNIT = 'yiru.service'
const WINDOWS_TASK = 'Yiru Daemon'
const WINDOWS_NATIVE_HOST_KEY =
  'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.yiru.daemon'
const WINDOWS_NATIVE_HOST_PROVIDER_PATH =
  'Registry::HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.yiru.daemon'

export function capturePlatformState(directory) {
  return {
    helper: captureMacHelperState(directory),
    registry: captureWindowsRegistryState(directory),
    service: captureServiceState(directory)
  }
}

export function nativeManifestPath() {
  const configured = trimmedEnvironment('YIRU_NATIVE_MESSAGING_CONFIG_ROOT')
  if (configured) {
    return join(resolve(configured), 'com.yiru.daemon.json')
  }
  if (process.platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      'com.yiru.daemon.json'
    )
  }
  if (process.platform === 'win32') {
    const appData = trimmedEnvironment('LOCALAPPDATA') || trimmedEnvironment('APPDATA')
    if (!appData) {
      throw new Error('APPDATA is required to install native messaging.')
    }
    return join(appData, 'Yiru', 'NativeMessagingHosts', 'com.yiru.daemon.json')
  }
  return join(configRoot(), 'google-chrome', 'NativeMessagingHosts', 'com.yiru.daemon.json')
}

export function quiesceService(service) {
  if (service.platform === 'darwin') {
    const domain = launchDomain()
    runStatus('/bin/launchctl', ['bootout', domain, service.definition.path])
    runStatus('/bin/launchctl', ['bootout', `${domain}/${SERVICE_LABEL}`])
    if (launchdServiceStatus(domain) === 'running') {
      throw new Error('The existing Yiru launch agent could not be stopped.')
    }
    return
  }
  if (service.platform === 'linux') {
    const currentState = readCurrentSystemdServiceState()
    if (currentState === 'running') {
      runRequired('systemctl', ['--user', 'stop', SYSTEMD_UNIT])
    }
    if (readCurrentSystemdServiceState() === 'running') {
      throw new Error('The existing Yiru systemd service could not be stopped.')
    }
    return
  }
  quiesceWindowsTask()
}

export function captureWindowsManifestAclState(manifest, directory) {
  if (process.platform !== 'win32') {
    return null
  }
  const entries = []
  if (manifest.parent?.existed) {
    entries.push(
      captureWindowsAcl(manifest.parent.path, join(directory, 'native-manifest-parent.acl'))
    )
  }
  if (manifest.existed) {
    entries.push(captureWindowsAcl(manifest.path, join(directory, 'native-manifest.acl')))
  }
  return { entries }
}

export function restoreMacHelperState(state) {
  if (!state) {
    return
  }
  const parentPath = dirname(state.path)
  mkdirSync(parentPath, { recursive: true })
  const staging = mkdtempSync(join(parentPath, '.yiru-helper-restore-'))
  const current = join(staging, 'current')
  let preserve = false
  const errors = []
  try {
    let candidate = null
    if (state.existed) {
      runRequired('/usr/bin/ditto', ['-x', '-k', state.backupPath, staging])
      candidate = join(staging, 'computer-use')
      const executable = join(
        candidate,
        'Yiru Computer Use.app',
        'Contents',
        'MacOS',
        'yiru-computer-use-macos'
      )
      if (!statSync(executable).isFile() || statSync(executable).size === 0) {
        throw new Error('The macOS helper recovery archive is invalid.')
      }
    }
    const hadCurrent = pathExists(state.path)
    if (hadCurrent) {
      renameSync(state.path, current)
    }
    if (candidate) {
      try {
        renameSync(candidate, state.path)
      } catch (replaceError) {
        if (hadCurrent) {
          try {
            renameSync(current, state.path)
          } catch (restoreError) {
            preserve = true
            throw new Error(
              `Could not restore the macOS helper: ${errorMessage(replaceError)}; its current state remains at ${current}: ${errorMessage(restoreError)}`,
              { cause: replaceError }
            )
          }
        }
        throw replaceError
      }
    }
    syncDirectory(parentPath)
  } catch (error) {
    errors.push(`helper: ${errorMessage(error)}`)
  }
  if (!preserve) {
    try {
      rmSync(staging, { force: true, recursive: true })
    } catch (error) {
      errors.push(`staging cleanup: ${errorMessage(error)}`)
    }
  }
  try {
    restoreManagedDirectory(state.parent)
  } catch (error) {
    errors.push(`parent directory: ${errorMessage(error)}`)
  }
  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}

export function restoreWindowsRegistryState(state) {
  if (!state) {
    return
  }
  const executable = windowsSystemExecutable('reg.exe')
  const currentState = windowsRegistryState()
  if (currentState === 0) {
    runRequired(executable, ['DELETE', WINDOWS_NATIVE_HOST_KEY, '/f'])
  } else if (currentState !== 3) {
    throw new Error('Could not inspect the replacement Native Messaging registry key.')
  }
  if (state.existed) {
    runRequired(executable, ['IMPORT', state.backupPath])
  }
}

export function restoreWindowsManifestAclState(state) {
  if (!state) {
    return
  }
  const errors = []
  for (const entry of state.entries) {
    try {
      runRequired(windowsSystemExecutable('icacls.exe'), [
        entry.basePath,
        '/restore',
        entry.backupPath,
        '/l',
        '/q'
      ])
    } catch (error) {
      errors.push(`${entry.path}: ${errorMessage(error)}`)
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}

export function restoreServiceState(service) {
  if (service.platform === 'win32') {
    restoreWindowsTaskState(service)
    return
  }
  restorePathState(service.definition)
  if (service.platform === 'darwin') {
    restoreLaunchdState(service)
    return
  }
  restoreSystemdState(service)
}

function captureMacHelperState(directory) {
  if (process.platform !== 'darwin') {
    return null
  }
  const override = trimmedEnvironment('YIRU_COMPUTER_MACOS_HELPER_APP_PATH')
  if (override && existsSync(join(override, 'Contents', 'MacOS', 'yiru-computer-use-macos'))) {
    return null
  }
  const root =
    trimmedEnvironment('YIRU_APP_USER_DATA_PATH') ||
    trimmedEnvironment('YIRU_USER_DATA_PATH') ||
    join(homedir(), 'Library', 'Application Support', 'yiru')
  const path = join(resolve(root), 'native', 'computer-use')
  const parent = captureManagedDirectory(dirname(path))
  if (!pathExists(path)) {
    return { existed: false, parent, path }
  }
  const metadata = lstatSync(path)
  if (metadata.isSymbolicLink()) {
    throw new Error(`Cannot safely preserve symlink-backed macOS helper ${path}.`)
  }
  if (!metadata.isDirectory()) {
    throw new Error(`Cannot preserve ${path} because it is not a directory.`)
  }
  const backupPath = join(directory, 'computer-use.zip')
  runRequired('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path, backupPath])
  return { backupPath, existed: true, parent, path }
}

function captureServiceState(directory) {
  if (process.platform === 'darwin') {
    return captureLaunchdState(directory)
  }
  if (process.platform === 'linux') {
    return captureSystemdState(directory)
  }
  return captureWindowsTaskState(directory)
}

function captureLaunchdState(directory) {
  const definitionPath = join(homedir(), 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`)
  const domain = launchDomain()
  runRequired('/bin/launchctl', ['print', domain])
  const disabled = runTextRequired('/bin/launchctl', ['print-disabled', domain])
  const escapedLabel = SERVICE_LABEL.replaceAll('.', '\\.')
  const serviceState = launchdServiceStatus(domain)
  const definition = capturePathState(
    definitionPath,
    join(directory, 'service-definition.previous'),
    true
  )
  if (!definition.existed && serviceState === 'running') {
    throw new Error('A running Yiru launch agent without a managed definition cannot be restored.')
  }
  return {
    definition,
    enabled: !new RegExp(`"${escapedLabel}"\\s*=>\\s*true`).test(disabled),
    platform: 'darwin',
    state: serviceState === 'running' ? 'running' : definition.existed ? 'stopped' : 'not_installed'
  }
}

function captureSystemdState(directory) {
  const definitionPath = join(configRoot(), 'systemd', 'user', SYSTEMD_UNIT)
  const definition = capturePathState(
    definitionPath,
    join(directory, 'service-definition.previous'),
    true
  )
  const state = readSystemdServiceState(definition.existed)
  return {
    definition,
    enabled: readSystemdEnabledState(definition.existed),
    platform: 'linux',
    state
  }
}

function readSystemdEnabledState(hasDefinition) {
  const result = runCommand('systemctl', ['--user', 'is-enabled', SYSTEMD_UNIT], 'utf8')
  const state = result.stdout.trim()
  if (result.status === 0 && state === 'enabled') {
    return true
  }
  if (result.status === 1 && state === 'disabled') {
    return false
  }
  if (!hasDefinition && result.status === 4 && state === 'not-found') {
    return false
  }
  throw new Error(
    `Cannot safely preserve Yiru's systemd enabled state '${state || 'unknown'}' (exit ${result.status ?? result.signal ?? 'unknown'}).`
  )
}

function readSystemdServiceState(hasDefinition) {
  const result = runCommand('systemctl', ['--user', 'is-active', SYSTEMD_UNIT], 'utf8')
  const state = result.stdout.trim()
  if (result.status === 0 && state === 'active') {
    if (!hasDefinition) {
      throw new Error(
        'An active Yiru systemd unit without a managed definition cannot be restored.'
      )
    }
    return 'running'
  }
  if (result.status === 3 && (state === 'inactive' || state === 'failed')) {
    if (!hasDefinition) {
      throw new Error(
        `A loaded Yiru systemd unit without a managed definition cannot be restored from '${state}'.`
      )
    }
    return 'stopped'
  }
  if (!hasDefinition && result.status === 4 && state === 'unknown') {
    return 'not_installed'
  }
  throw new Error(
    `Cannot safely preserve Yiru's systemd running state '${state || 'unknown'}' (exit ${result.status ?? result.signal ?? 'unknown'}).`
  )
}

function readCurrentSystemdServiceState() {
  const result = runCommand('systemctl', ['--user', 'is-active', SYSTEMD_UNIT], 'utf8')
  const state = result.stdout.trim()
  if (result.status === 0 && state === 'active') {
    return 'running'
  }
  if (result.status === 3 && (state === 'inactive' || state === 'failed')) {
    return 'stopped'
  }
  if (result.status === 4 && state === 'unknown') {
    return 'not_installed'
  }
  throw new Error(
    `Cannot safely inspect Yiru's current systemd state '${state || 'unknown'}' (exit ${result.status ?? result.signal ?? 'unknown'}).`
  )
}

function captureWindowsTaskState(directory) {
  const executable = windowsSystemExecutable('schtasks.exe')
  const runningStatus = windowsTaskRunningStatus()
  if (runningStatus === 3) {
    return { existed: false, platform: 'win32', state: 'not_installed' }
  }
  if (runningStatus !== 0 && runningStatus !== 2) {
    throw new Error(`Could not safely preserve the state of Windows task ${WINDOWS_TASK}.`)
  }
  const xmlPath = join(directory, 'service-task.xml')
  writeFileSync(xmlPath, runBufferRequired(executable, ['/Query', '/TN', WINDOWS_TASK, '/XML']))
  return {
    existed: true,
    platform: 'win32',
    state: runningStatus === 0 ? 'running' : 'stopped',
    xmlPath
  }
}

function captureWindowsRegistryState(directory) {
  if (process.platform !== 'win32') {
    return null
  }
  const executable = windowsSystemExecutable('reg.exe')
  const queryStatus = windowsRegistryState()
  if (queryStatus !== 0 && queryStatus !== 3) {
    throw new Error(
      `Could not inspect the Yiru Native Messaging registry key: exit ${queryStatus}.`
    )
  }
  if (queryStatus === 3) {
    return { existed: false }
  }
  const backupPath = join(directory, 'native-host.reg')
  runRequired(executable, ['EXPORT', WINDOWS_NATIVE_HOST_KEY, backupPath, '/y'])
  return { backupPath, existed: true }
}

function captureWindowsAcl(path, backupPath) {
  const basePath = dirname(path)
  runRequiredIn(basePath, windowsSystemExecutable('icacls.exe'), [
    basename(path),
    '/save',
    backupPath,
    '/l',
    '/q'
  ])
  return { backupPath, basePath, path }
}

function restoreWindowsTaskState(service) {
  const executable = windowsSystemExecutable('schtasks.exe')
  quiesceWindowsTask()
  const currentState = windowsTaskRunningStatus()
  if (currentState === 2) {
    runRequired(executable, ['/Delete', '/F', '/TN', WINDOWS_TASK])
  } else if (currentState !== 3) {
    throw new Error('Could not inspect the replacement Windows task.')
  }
  if (!service.existed) {
    return
  }
  runRequired(executable, ['/Create', '/F', '/TN', WINDOWS_TASK, '/XML', service.xmlPath])
  if (service.state === 'running') {
    runRequired(executable, ['/Run', '/TN', WINDOWS_TASK])
  }
}

function restoreLaunchdState(service) {
  const domain = launchDomain()
  if (service.enabled || service.state === 'running') {
    runRequired('/bin/launchctl', ['enable', `${domain}/${SERVICE_LABEL}`])
  }
  if (service.state === 'running') {
    runRequired('/bin/launchctl', ['bootstrap', domain, service.definition.path])
  }
  if (!service.enabled) {
    runRequired('/bin/launchctl', ['disable', `${domain}/${SERVICE_LABEL}`])
  }
}

function restoreSystemdState(service) {
  runRequired('systemctl', ['--user', 'daemon-reload'])
  if (service.definition.existed && service.enabled) {
    runRequired('systemctl', ['--user', 'enable', SYSTEMD_UNIT])
  } else {
    const disableStatus = runStatus('systemctl', ['--user', 'disable', SYSTEMD_UNIT])
    if (disableStatus !== 0 && service.definition.existed) {
      throw new Error('Could not restore the disabled Yiru systemd state.')
    }
  }
  if (service.state === 'running') {
    runRequired('systemctl', ['--user', 'start', SYSTEMD_UNIT])
  }
}

function launchdServiceStatus(domain) {
  const status = runStatus('/bin/launchctl', ['print', `${domain}/${SERVICE_LABEL}`])
  if (status === 0) {
    return 'running'
  }
  if (status === 113) {
    return 'not_installed'
  }
  throw new Error(`Could not safely inspect the Yiru launch agent: exit ${status}.`)
}

function waitForWindowsTaskToStop() {
  const script =
    '$taskName = $args[0]; $deadline = [DateTime]::UtcNow.AddSeconds(15); do { try { ' +
    "$tasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq $taskName -and $_.TaskPath -eq '\\' }); " +
    '} catch { exit 4 }; if ($tasks.Count -eq 0) { exit 0 }; ' +
    'if ($tasks.Count -ne 1) { exit 4 }; ' +
    "if ($tasks[0].State -ne 'Running' -and $tasks[0].State -ne 'Queued') { exit 0 }; " +
    'Start-Sleep -Milliseconds 100 } while ([DateTime]::UtcNow -lt $deadline); exit 2'
  runRequired(windowsPowerShellExecutable(), powershellArguments(script, [WINDOWS_TASK]))
}

function windowsTaskRunningStatus() {
  const script =
    '$taskName = $args[0]; try { ' +
    "$tasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq $taskName -and $_.TaskPath -eq '\\' }) " +
    '} catch { exit 4 }; if ($tasks.Count -eq 0) { exit 3 }; ' +
    'if ($tasks.Count -ne 1) { exit 4 }; ' +
    "if ($tasks[0].State -eq 'Running') { exit 0 }; " +
    "if ($tasks[0].State -eq 'Ready' -or $tasks[0].State -eq 'Disabled') { exit 2 }; " +
    "if ($tasks[0].State -eq 'Queued') { exit 5 }; exit 4"
  return runStatus(windowsPowerShellExecutable(), powershellArguments(script, [WINDOWS_TASK]))
}

function windowsRegistryState() {
  const script =
    'try { if (Test-Path -LiteralPath $args[0] -PathType Container -ErrorAction Stop) { exit 0 }; exit 3 } catch { exit 4 }'
  return runStatus(
    windowsPowerShellExecutable(),
    powershellArguments(script, [WINDOWS_NATIVE_HOST_PROVIDER_PATH])
  )
}

function quiesceWindowsTask() {
  const executable = windowsSystemExecutable('schtasks.exe')
  const state = windowsTaskRunningStatus()
  if (state === 0 || state === 5) {
    runRequired(executable, ['/End', '/TN', WINDOWS_TASK])
    waitForWindowsTaskToStop()
    return
  }
  if (state !== 2 && state !== 3) {
    throw new Error(`Could not safely stop Windows task ${WINDOWS_TASK}.`)
  }
}

function powershellArguments(script, argumentsList) {
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, ...argumentsList]
}

function configRoot() {
  return trimmedEnvironment('XDG_CONFIG_HOME') || join(homedir(), '.config')
}

function launchDomain() {
  if (process.getuid === undefined) {
    throw new Error('The current user id is unavailable for launchd.')
  }
  return `gui/${process.getuid()}`
}

function windowsSystemExecutable(name) {
  const root = trimmedEnvironment('SystemRoot')
  return root ? join(root, 'System32', name) : name
}

function windowsPowerShellExecutable() {
  const root = trimmedEnvironment('SystemRoot')
  return root
    ? join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
}

function trimmedEnvironment(name) {
  const value = process.env[name]?.trim()
  return value || null
}

function runRequired(program, argumentsList) {
  const result = runCommand(program, argumentsList, 'utf8')
  if (result.status !== 0) {
    throw new Error(`${program} failed with exit ${result.status ?? result.signal ?? 'unknown'}.`)
  }
  return result
}

function runTextRequired(program, argumentsList) {
  return runRequired(program, argumentsList).stdout
}

function runBufferRequired(program, argumentsList) {
  const result = runCommand(program, argumentsList)
  if (result.status !== 0) {
    throw new Error(`${program} failed with exit ${result.status ?? result.signal ?? 'unknown'}.`)
  }
  return result.stdout
}

function runRequiredIn(directory, program, argumentsList) {
  const result = runCommand(program, argumentsList, 'utf8', directory)
  if (result.status !== 0) {
    throw new Error(`${program} failed with exit ${result.status ?? result.signal ?? 'unknown'}.`)
  }
  return result
}

function runStatus(program, argumentsList) {
  return runCommand(program, argumentsList, 'utf8').status ?? -1
}

function runCommand(program, argumentsList, encoding, cwd) {
  const result = spawnSync(program, argumentsList, {
    cwd,
    encoding,
    maxBuffer: 4 * 1024 * 1024,
    timeout: COMMAND_DEADLINE_MS,
    windowsHide: true
  })
  if (result.error) {
    throw result.error
  }
  return result
}

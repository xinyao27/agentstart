#!/usr/bin/env node

// Why: one process must coordinate Xcode build, Simulator lifecycle, daemon startup, and E2EE
// pairing so development cannot be expressed as an independent package.json command sequence.
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const iosRoot = path.resolve(import.meta.dirname, '..')
const projectPath = path.join(iosRoot, 'AgentStartMobile.xcodeproj')
const derivedDataPath = path.join(iosRoot, 'build', 'DevelopmentDerivedData')
const appPath = path.join(
  derivedDataPath,
  'Build',
  'Products',
  'Debug-iphonesimulator',
  'AgentStart.app'
)
const bundleID = 'com.xinyao27.agentstart.mobile'
const conflictingDevelopmentBundleIDs = ['me.xinyao.agentstart.mobile.ios']
const defaultDevelopmentDaemonCLI = path.join(
  iosRoot,
  '..',
  'daemon',
  'target',
  'release',
  'agentstart'
)
const developmentDaemonCLI = process.env.AGENTSTART_CLI || defaultDevelopmentDaemonCLI
const pairingTimeoutMs = 120_000
const pairingRetryIntervalMs = 1_000

const options = parseOptions(process.argv.slice(2))
const shouldAutoPair =
  process.platform === 'darwin' &&
  process.env.AGENTSTART_MOBILE_AUTO_PAIR !== '0' &&
  existsSync(developmentDaemonCLI)

function parseOptions(args) {
  const parsed = {
    deviceName: process.env.AGENTSTART_IOS_SIMULATOR || 'iPhone 17 Pro',
    openXcode: true,
    reuseBuild: false
  }
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--device' && args[index + 1]) {
      parsed.deviceName = args[index + 1]
      index += 1
    } else if (args[index] === '--no-open-xcode') {
      parsed.openXcode = false
    } else if (args[index] === '--reuse-build') {
      parsed.reuseBuild = true
    } else if (args[index] === '--help' || args[index] === '-h') {
      console.log(`Usage: node scripts/start-development.mjs [options]

Options:
  --device <name>   Simulator name (default: iPhone 17 Pro)
  --reuse-build     Install the existing DevelopmentDerivedData build without recompiling
  --no-open-xcode   Do not open the generated Xcode project
  --help, -h        Show this help message`)
      process.exit(0)
    }
  }
  return parsed
}

function logStep(message) {
  console.log(`[mobile] ${message}`)
}

function runInherited(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: iosRoot,
      env: process.env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} was terminated by ${signal}`))
      } else if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with code ${code}`))
      }
    })
  })
}

async function findSimulator(deviceName) {
  const { stdout } = await execFileAsync(
    'xcrun',
    ['simctl', 'list', 'devices', 'available', '--json'],
    { encoding: 'utf8' }
  )
  const runtimes = Object.entries(JSON.parse(stdout).devices)
    .filter(([runtime]) => runtime.includes('SimRuntime.iOS-'))
    .sort(([left], [right]) => right.localeCompare(left, undefined, { numeric: true }))
  const devices = runtimes.flatMap(([runtime, entries]) =>
    entries.filter((device) => device.isAvailable).map((device) => ({ ...device, runtime }))
  )
  const exact = devices.filter((device) => device.name === deviceName)
  return (
    exact.find((device) => device.state === 'Booted') ??
    exact[0] ??
    devices.find(
      (device) =>
        device.state === 'Booted' &&
        device.name.toLocaleLowerCase().includes(deviceName.toLocaleLowerCase())
    ) ??
    devices.find((device) => device.name.includes('iPhone')) ??
    null
  )
}

async function buildAndInstall(device) {
  logStep(`Building for ${device.name}`)
  await runInherited('xcodebuild', [
    '-project',
    projectPath,
    '-scheme',
    'AgentStartMobile',
    '-configuration',
    'Debug',
    '-destination',
    `id=${device.udid}`,
    '-derivedDataPath',
    derivedDataPath,
    'build'
  ])
  if (!existsSync(appPath)) {
    throw new Error(`Built app was not found at ${appPath}`)
  }
  await execFileAsync('xcrun', ['simctl', 'install', device.udid, appPath])
  logStep('Installed native AgentStart Mobile')
}

async function installExistingBuild(device) {
  if (!existsSync(appPath)) {
    throw new Error(
      `No existing development build at ${appPath}; run without --reuse-build once first`
    )
  }
  logStep('Reusing existing DevelopmentDerivedData build')
  await execFileAsync('xcrun', ['simctl', 'install', device.udid, appPath])
  logStep('Installed native AgentStart Mobile')
}

async function stopConflictingDevelopmentApps(device) {
  for (const conflictingBundleID of conflictingDevelopmentBundleIDs) {
    try {
      await execFileAsync('xcrun', ['simctl', 'terminate', device.udid, conflictingBundleID])
      logStep(`Stopped conflicting simulator app ${conflictingBundleID}`)
    } catch {
      // Why: terminate also fails when the old app is absent or already stopped.
    }
  }
}

async function waitForDevelopmentPairing(device) {
  if (!shouldAutoPair) {
    logStep('Daemon auto-pair disabled; launching with stored hosts')
    return null
  }

  await ensureDevelopmentDaemon()
  logStep('Waiting for the development daemon')
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < pairingTimeoutMs) {
    try {
      const { stdout } = await execFileAsync(
        developmentDaemonCLI,
        [
          'mobile',
          'pair',
          '--address',
          '127.0.0.1',
          '--device-name',
          `iOS Simulator ${device.udid}`,
          '--json'
        ],
        { cwd: path.resolve(iosRoot, '..', '..'), encoding: 'utf8', timeout: 5_000 }
      )
      const pairingUrl = JSON.parse(stdout)?.pairingUrl
      if (typeof pairingUrl !== 'string' || pairingUrl.length === 0) {
        throw new Error('Development daemon returned no pairing URL')
      }
      logStep('Development daemon is ready')
      return pairingUrl
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, pairingRetryIntervalMs))
    }
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`Timed out waiting for the development daemon${detail}`)
}

async function ensureDevelopmentDaemon() {
  try {
    const { stdout } = await execFileAsync(developmentDaemonCLI, ['status', '--json'], {
      cwd: path.resolve(iosRoot, '..', '..'),
      encoding: 'utf8',
      timeout: 5_000
    })
    if (JSON.parse(stdout)?.state === 'running') {
      return
    }
  } catch {
    // Why: an absent or stale daemon is the normal first-run path below.
  }
  const daemon = spawn(developmentDaemonCLI, ['daemon'], {
    cwd: path.resolve(iosRoot, '..', '..'),
    detached: true,
    env: process.env,
    stdio: 'ignore'
  })
  daemon.unref()
}

async function launch(device, pairingUrl) {
  await execFileAsync('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], {
    timeout: 120_000
  })
  await execFileAsync('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', device.udid])

  const launchArgs = ['simctl', 'launch', '--terminate-running-process', device.udid, bundleID]
  if (pairingUrl) {
    // Why: SIMCTL_CHILD_* is not consistently forwarded by every Simulator/Xcode
    // launch path. Carry the short-lived offer as an explicit debug argument so
    // `pnpm dev:mobile` cannot silently fall back to an empty host list.
    launchArgs.push('--development-auto-pair', `--development-auto-pair-url=${pairingUrl}`)
  }
  const launchEnvironment = { ...process.env }
  if (pairingUrl) {
    launchEnvironment.SIMCTL_CHILD_AGENTSTART_DEVELOPMENT_PAIRING_URL = pairingUrl
  }
  await execFileAsync('xcrun', launchArgs, { env: launchEnvironment })
  logStep('Launched AgentStart Mobile')

  if (!pairingUrl) {
    return
  }
  logStep('Passed the loopback pairing offer to the debug simulator for automatic confirmation')
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('Native iOS development requires macOS and Xcode')
  }
  const device = await findSimulator(options.deviceName)
  if (!device) {
    throw new Error('No available iOS Simulator was found')
  }
  logStep(`Using ${device.name} (${device.runtime})`)
  await execFileAsync('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], {
    timeout: 120_000
  })
  await (options.reuseBuild ? installExistingBuild(device) : buildAndInstall(device))
  await stopConflictingDevelopmentApps(device)
  const pairingUrl = await waitForDevelopmentPairing(device)
  await launch(device, pairingUrl)
  if (options.openXcode) {
    await execFileAsync('open', [projectPath])
  }
  logStep('Native development app is ready')
}

main().catch((error) => {
  console.error(`[mobile] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

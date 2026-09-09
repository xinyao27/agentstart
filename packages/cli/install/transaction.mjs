import { closeSync, fsyncSync, mkdirSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'

import { prepareReleaseCandidate } from './download.mjs'
import {
  captureManagedDirectory,
  pathExists,
  replacePath,
  restoreManagedDirectory
} from './filesystem-state.mjs'
import { createInstallControl, runRequiredSetup, throwIfInterrupted } from './setup-process.mjs'
import {
  captureInstallationState,
  restoreInstallationState,
  stopInstalledService
} from './snapshot.mjs'

export async function installReleaseTransaction(options) {
  const installDirectoryState = captureManagedDirectory(options.installDirectory)
  let directory
  try {
    mkdirSync(options.installDirectory, { recursive: true })
    directory = mkdtempSync(join(options.installDirectory, '.yiru-install-'))
  } catch (error) {
    try {
      restoreManagedDirectory(installDirectoryState)
    } catch (restoreError) {
      throw new Error(
        `Yiru could not create its transaction directory: ${errorMessage(error)}; directory rollback failed: ${errorMessage(restoreError)}`,
        { cause: error }
      )
    }
    throw error
  }
  const control = createInstallControl()
  let state
  let committed = false
  let rollbackFailed = false
  let failure = null
  try {
    const candidatePath = await prepareReleaseCandidate({
      assetName: options.assetName,
      control,
      directory,
      releaseBase: `https://github.com/${options.repository}/releases/download/v${options.packageVersion}`
    })
    throwIfInterrupted(control)
    state = captureInstallationState({
      directory,
      executablePath: options.executablePath,
      versionPath: options.versionPath
    })
    state.mutationStarted = true
    stopInstalledService(state)
    try {
      replacePath(candidatePath, options.executablePath)
      state.binaryChanged = true
    } catch (error) {
      captureReplacementRecoveryPath(state, error)
      state.binaryChanged =
        error?.replacementCompleted === true ||
        state.replacementRecoveryPaths.length > 0 ||
        !pathExists(options.executablePath)
      throw error
    }
    await runRequiredSetup(options.executablePath, ['install', '--no-browser'], control)
    throwIfInterrupted(control)
    const stagedVersion = join(directory, 'version.current')
    writeVersionCandidate(stagedVersion, options.packageVersion)
    try {
      replacePath(stagedVersion, options.versionPath)
    } catch (error) {
      captureReplacementRecoveryPath(state, error)
      throw error
    }
    syncInstallDirectory(options.installDirectory)
    committed = true
  } catch (error) {
    failure = error
    if (state?.mutationStarted) {
      try {
        restoreInstallationState(state)
        removeReplacementRecoveryPaths(state.replacementRecoveryPaths)
        state.replacementRecoveryPaths = []
      } catch (rollbackError) {
        rollbackFailed = true
        const recoveryLocations = [directory, ...state.replacementRecoveryPaths].join(' and ')
        failure = new Error(
          `Yiru installation failed: ${errorMessage(error)}; rollback failed: ${errorMessage(rollbackError)}. Recovery files were preserved at ${recoveryLocations}.`,
          { cause: error }
        )
      }
    }
    if (!rollbackFailed && control.receivedSignal) {
      failure = { installSignal: control.receivedSignal }
    }
  }
  control.dispose()
  if (!rollbackFailed) {
    try {
      rmSync(directory, { force: true, recursive: true })
      if (!committed) {
        restoreManagedDirectory(installDirectoryState)
      }
    } catch (error) {
      if (failure) {
        console.error(`Yiru transaction cleanup also failed: ${errorMessage(error)}`)
      } else {
        failure = new Error(
          `Yiru ${options.packageVersion} was installed, but recovery data at ${directory} could not be removed: ${errorMessage(error)}`
        )
      }
    }
  }
  if (failure) {
    throw failure
  }
}

function captureReplacementRecoveryPath(state, error) {
  const path = typeof error?.recoveryStagingPath === 'string' ? error.recoveryStagingPath : null
  if (path && !state.replacementRecoveryPaths.includes(path)) {
    state.replacementRecoveryPaths.push(path)
  }
}

function removeReplacementRecoveryPaths(paths) {
  const errors = []
  for (const path of paths) {
    try {
      rmSync(path, { force: true, recursive: true })
    } catch (error) {
      errors.push(`${path}: ${errorMessage(error)}`)
    }
  }
  if (errors.length > 0) {
    throw new Error(`replacement recovery cleanup failed: ${errors.join('; ')}`)
  }
}

function writeVersionCandidate(path, version) {
  const descriptor = openSync(path, 'wx', 0o600)
  try {
    const contents = Buffer.from(`${version}\n`)
    let offset = 0
    while (offset < contents.byteLength) {
      offset += writeSync(descriptor, contents, offset, contents.byteLength - offset)
    }
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function syncInstallDirectory(path) {
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

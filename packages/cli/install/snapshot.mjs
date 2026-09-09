import { join } from 'node:path'

import { capturePathState, restorePathState } from './filesystem-state.mjs'
import {
  capturePlatformState,
  captureWindowsManifestAclState,
  nativeManifestPath,
  quiesceService,
  restoreMacHelperState,
  restoreServiceState,
  restoreWindowsManifestAclState,
  restoreWindowsRegistryState
} from './platform-state.mjs'

export function captureInstallationState(options) {
  const manifest = capturePathState(
    nativeManifestPath(),
    join(options.directory, 'native-manifest.previous'),
    true
  )
  const platform = capturePlatformState(options.directory)
  return {
    binary: capturePathState(options.executablePath, join(options.directory, 'binary.previous')),
    binaryChanged: false,
    binaryReplacementRecoveryPath: null,
    helper: platform.helper,
    manifest,
    manifestAcl: captureWindowsManifestAclState(manifest, options.directory),
    mutationStarted: false,
    replacementRecoveryPaths: [],
    registry: platform.registry,
    service: platform.service,
    version: capturePathState(options.versionPath, join(options.directory, 'version.previous'))
  }
}

export function restoreInstallationState(state) {
  const errors = []
  const restore = (name, operation) => {
    try {
      operation()
    } catch (error) {
      errors.push(`${name}: ${errorMessage(error)}`)
    }
  }
  restore('replacement service stop', () => quiesceService(state.service))
  if (state.binaryChanged) {
    restore('binary', () => restorePathState(state.binary))
  }
  restore('version marker', () => restorePathState(state.version))
  restore('macOS helper', () => restoreMacHelperState(state.helper))
  restore('Native Messaging manifest', () => restorePathState(state.manifest))
  restore('Native Messaging ACLs', () => restoreWindowsManifestAclState(state.manifestAcl))
  restore('Native Messaging registry', () => restoreWindowsRegistryState(state.registry))
  restore('service', () => restoreServiceState(state.service))
  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}

export function stopInstalledService(state) {
  quiesceService(state.service)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

import {
  chmodSync,
  closeSync,
  copyFileSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readlinkSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  symlinkSync,
  utimesSync
} from 'node:fs'
import { dirname, join } from 'node:path'

export function capturePathState(path, backupPath, manageParent = false) {
  const parent = manageParent ? captureManagedDirectory(dirname(path)) : null
  let metadata
  try {
    metadata = lstatSync(path)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { existed: false, parent, path }
    }
    throw error
  }
  if (metadata.isSymbolicLink()) {
    return { existed: true, kind: 'symlink', link: readlinkSync(path), parent, path }
  }
  if (!metadata.isFile()) {
    throw new Error(`Cannot preserve ${path} because it is not a file.`)
  }
  copyFileSync(path, backupPath)
  return {
    atime: metadata.atime,
    backupPath,
    existed: true,
    kind: 'file',
    mode: metadata.mode & 0o777,
    mtime: metadata.mtime,
    parent,
    path
  }
}

export function restorePathState(state) {
  const parentPath = dirname(state.path)
  mkdirSync(parentPath, { recursive: true })
  const staging = mkdtempSync(join(parentPath, '.yiru-path-restore-'))
  const guard = { preserve: false }
  const errors = []
  try {
    const candidate = state.existed ? stagePathCandidate(state, staging) : null
    switchRestoredPath(candidate, state.path, staging, guard)
    syncDirectory(parentPath)
  } catch (error) {
    errors.push(`path: ${errorMessage(error)}`)
  }
  if (!guard.preserve) {
    try {
      rmSync(staging, { force: true, recursive: true })
    } catch (error) {
      errors.push(`staging cleanup: ${errorMessage(error)}`)
    }
  }
  if (state.parent) {
    try {
      restoreManagedDirectory(state.parent)
    } catch (error) {
      errors.push(`parent directory: ${errorMessage(error)}`)
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}

export function captureManagedDirectory(path) {
  const missing = []
  let cursor = path
  while (!pathExists(cursor)) {
    missing.push(cursor)
    const parent = dirname(cursor)
    if (parent === cursor) {
      throw new Error(`Cannot resolve an existing parent for ${path}.`)
    }
    cursor = parent
  }
  const metadata = statSync(cursor)
  if (!metadata.isDirectory()) {
    throw new Error(`Cannot install below non-directory path ${cursor}.`)
  }
  return {
    existed: missing.length === 0,
    missing,
    mode: missing.length === 0 ? metadata.mode & 0o777 : null,
    path
  }
}

export function restoreManagedDirectory(state) {
  if (state.existed) {
    chmodSync(state.path, state.mode)
    return
  }
  for (const path of state.missing) {
    try {
      rmdirSync(path)
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }
}

export function replacePath(source, destination) {
  try {
    renameSync(source, destination)
    return
  } catch (error) {
    if (process.platform !== 'win32' || !pathExists(destination)) {
      throw error
    }
  }
  assertReplaceablePath(destination)
  const staging = mkdtempSync(join(dirname(destination), '.yiru-replace-'))
  const current = join(staging, 'current')
  let preserve = false
  let recoveryStagingPath = null
  let replacementCompleted = false
  let failure = null
  try {
    renameSync(destination, current)
  } catch (moveError) {
    try {
      rmSync(staging, { force: true, recursive: true })
    } catch (cleanupError) {
      recoveryStagingPath = staging
      failure = new Error(
        `Could not prepare ${destination} for replacement: ${errorMessage(moveError)}; replacement staging remains at ${staging}: ${errorMessage(cleanupError)}`,
        { cause: moveError }
      )
      failure.recoveryStagingPath = recoveryStagingPath
    }
    throw failure || moveError
  }
  try {
    renameSync(source, destination)
    replacementCompleted = true
  } catch (replaceError) {
    try {
      renameSync(current, destination)
    } catch (restoreError) {
      preserve = true
      recoveryStagingPath = staging
      failure = new Error(
        `Could not replace ${destination}: ${errorMessage(replaceError)}; its prior state could not be moved back and remains at ${current}: ${errorMessage(restoreError)}`,
        { cause: replaceError }
      )
    }
    failure ||= replaceError
  }
  if (!preserve) {
    try {
      rmSync(staging, { force: true, recursive: true })
    } catch (cleanupError) {
      recoveryStagingPath = staging
      failure = new Error(
        `${failure ? `${errorMessage(failure)}; ` : ''}replacement staging cleanup failed at ${staging}: ${errorMessage(cleanupError)}`,
        { cause: failure || cleanupError }
      )
    }
  }
  if (failure) {
    if (replacementCompleted) {
      failure.replacementCompleted = true
    }
    if (recoveryStagingPath) {
      failure.recoveryStagingPath = recoveryStagingPath
    }
    throw failure
  }
}

export function pathExists(path) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function stagePathCandidate(state, staging) {
  const candidate = join(staging, 'candidate')
  if (state.kind === 'symlink') {
    symlinkSync(state.link, candidate)
    return candidate
  }
  copyFileSync(state.backupPath, candidate)
  chmodSync(candidate, state.mode)
  utimesSync(candidate, state.atime, state.mtime)
  syncFile(candidate)
  return candidate
}

function switchRestoredPath(candidate, destination, staging, guard) {
  if (process.platform !== 'win32' && candidate) {
    renameSync(candidate, destination)
    return
  }
  const current = join(staging, 'current')
  const hadCurrent = pathExists(destination)
  if (hadCurrent) {
    assertReplaceablePath(destination)
    renameSync(destination, current)
  }
  if (!candidate) {
    return
  }
  try {
    renameSync(candidate, destination)
  } catch (replaceError) {
    if (hadCurrent) {
      try {
        renameSync(current, destination)
      } catch (restoreError) {
        guard.preserve = true
        throw new Error(
          `Could not restore ${destination}: ${errorMessage(replaceError)}; its current state could not be moved back and remains at ${current}: ${errorMessage(restoreError)}`,
          { cause: replaceError }
        )
      }
    }
    throw replaceError
  }
}

function assertReplaceablePath(path) {
  const metadata = lstatSync(path)
  if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
    throw new Error(`Refusing to replace unexpected directory ${path}.`)
  }
}

function syncFile(path) {
  const descriptor = openSync(path, 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

export function syncDirectory(path) {
  if (process.platform === 'win32') {
    return
  }
  syncFile(path)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

import type { FsChangedPayload } from '@yiru/protocol/files/watch-values'
import { normalizeRuntimePathForComparison } from '@yiru/protocol/host/path'
import { basename } from '~renderer/path'
import { useAppStore } from '~renderer/store/state'

import { openFileRuntimeOwner, type WatchedTarget } from './external-watch-types'
import type { OpenFile } from './state'

const EXTERNAL_MUTATION_DEBOUNCE_MS = 75

export function createExternalMutationTracker(): {
  dispose: () => void
  record: (payload: FsChangedPayload, target: WatchedTarget) => void
} {
  const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>()
  const record = (payload: FsChangedPayload, target: WatchedTarget): void => {
    const createdPaths = collectCreatedPaths(payload)
    cancelResurrectedDeletes(pendingDeletes, target, createdPaths)
    const openFiles = useAppStore.getState().openFiles
    const deletedFileIds = collectDeletedOpenEditorIds(payload, target, openFiles)
    if (deletedFileIds.length > 0) {
      if (hasRenameCorrelatedCreate(payload, target.worktreeId, deletedFileIds, openFiles)) {
        const setExternalMutation = useAppStore.getState().setExternalMutation
        for (const fileId of deletedFileIds) {
          setExternalMutation(fileId, 'renamed')
        }
      } else {
        scheduleDeletedMarks(pendingDeletes, payload, target, deletedFileIds, openFiles)
      }
    }
    clearResurrectedMarks(target, createdPaths)
  }
  const dispose = (): void => {
    for (const timer of pendingDeletes.values()) {
      clearTimeout(timer)
    }
    pendingDeletes.clear()
  }
  return { dispose, record }
}

function collectCreatedPaths(payload: FsChangedPayload): Set<string> {
  const paths = new Set<string>()
  for (const event of payload.events) {
    if (event.isDirectory !== true && (event.kind === 'create' || event.kind === 'update')) {
      paths.add(normalizeRuntimePathForComparison(event.absolutePath))
    }
  }
  return paths
}

function cancelResurrectedDeletes(
  pendingDeletes: Map<string, ReturnType<typeof setTimeout>>,
  target: WatchedTarget,
  createdPaths: Set<string>
): void {
  for (const path of createdPaths) {
    const key = pendingDeleteKey(target, path)
    const timer = pendingDeletes.get(key)
    if (timer) {
      clearTimeout(timer)
      pendingDeletes.delete(key)
    }
  }
}

function scheduleDeletedMarks(
  pendingDeletes: Map<string, ReturnType<typeof setTimeout>>,
  payload: FsChangedPayload,
  target: WatchedTarget,
  deletedFileIds: string[],
  openFiles: OpenFile[]
): void {
  const deletePaths = buildDeletePathByFileId(payload, target, deletedFileIds, openFiles)
  for (const fileId of deletedFileIds) {
    const absolutePath = deletePaths.get(fileId)
    if (!absolutePath) {
      continue
    }
    const key = pendingDeleteKey(target, absolutePath)
    const existing = pendingDeletes.get(key)
    if (existing) {
      clearTimeout(existing)
    }
    const timer = setTimeout(() => {
      pendingDeletes.delete(key)
      const state = useAppStore.getState()
      if (state.openFiles.some((file) => file.id === fileId && file.mode === 'edit')) {
        state.setExternalMutation(fileId, 'deleted')
      }
    }, EXTERNAL_MUTATION_DEBOUNCE_MS)
    pendingDeletes.set(key, timer)
  }
}

function clearResurrectedMarks(target: WatchedTarget, createdPaths: Set<string>): void {
  if (createdPaths.size === 0) {
    return
  }
  const state = useAppStore.getState()
  for (const file of state.openFiles) {
    if (
      file.worktreeId === target.worktreeId &&
      openFileRuntimeOwner(file) === target.runtimeEnvironmentId &&
      (file.mode === 'edit' || file.mode === 'markdown-preview') &&
      (file.externalMutation === 'deleted' || file.externalMutation === 'renamed') &&
      createdPaths.has(normalizeRuntimePathForComparison(file.filePath))
    ) {
      state.setExternalMutation(file.id, null)
    }
  }
}

function buildDeletePathByFileId(
  payload: FsChangedPayload,
  target: WatchedTarget,
  deletedFileIds: string[],
  openFiles: OpenFile[]
): Map<string, string> {
  const deletePaths = collectDeletePaths(payload)
  const result = new Map<string, string>()
  const deletedIdSet = new Set(deletedFileIds)
  for (const file of openFiles) {
    if (
      deletedIdSet.has(file.id) &&
      file.worktreeId === target.worktreeId &&
      openFileRuntimeOwner(file) === target.runtimeEnvironmentId
    ) {
      const normalized = normalizeRuntimePathForComparison(file.filePath)
      if (deletePaths.has(normalized)) {
        result.set(file.id, normalized)
      }
    }
  }
  return result
}

function collectDeletedOpenEditorIds(
  payload: FsChangedPayload,
  target: WatchedTarget,
  openFiles: OpenFile[]
): string[] {
  const deletePaths = collectDeletePaths(payload)
  if (deletePaths.size === 0) {
    return []
  }
  return openFiles
    .filter(
      (file) =>
        file.worktreeId === target.worktreeId &&
        openFileRuntimeOwner(file) === target.runtimeEnvironmentId &&
        (file.mode === 'edit' || file.mode === 'markdown-preview') &&
        deletePaths.has(normalizeRuntimePathForComparison(file.filePath))
    )
    .map((file) => file.id)
}

function collectDeletePaths(payload: FsChangedPayload): Set<string> {
  const paths = new Set<string>()
  for (const event of payload.events) {
    if (event.kind === 'delete') {
      paths.add(normalizeRuntimePathForComparison(event.absolutePath))
    }
  }
  return paths
}

function hasRenameCorrelatedCreate(
  payload: FsChangedPayload,
  worktreeId: string,
  deletedFileIds: string[],
  openFiles: OpenFile[]
): boolean {
  const deletedIdSet = new Set(deletedFileIds)
  const deletedBasenames = new Set(
    openFiles
      .filter(
        (file) =>
          file.worktreeId === worktreeId &&
          (file.mode === 'edit' || file.mode === 'markdown-preview') &&
          deletedIdSet.has(file.id)
      )
      .map((file) => basename(file.filePath))
  )
  return payload.events.some(
    (event) =>
      event.kind === 'create' &&
      event.isDirectory !== true &&
      deletedBasenames.has(basename(event.absolutePath))
  )
}

function pendingDeleteKey(target: WatchedTarget, absolutePath: string): string {
  return `${target.worktreeId}::${target.runtimeEnvironmentId ?? 'client'}::${absolutePath}`
}

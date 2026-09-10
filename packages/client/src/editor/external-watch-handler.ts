import type { FsChangedPayload } from '@agentstart/protocol/files/watch-values'
import { getExternalFileChangeRelativePath } from '~renderer/workspace-panel/file-explorer/use-watch'
import {
  AGENTSTART_WORKTREE_FILE_CHANGE_EVENT,
  type WorktreeFileChangeEventDetail
} from '~renderer/worktree/file-change-event'

import { createExternalMutationTracker } from './external-watch-mutations'
import {
  getOverflowExternalReloadTargets,
  scheduleDebouncedExternalReload,
  scheduleExternalReloads
} from './external-watch-reload'
import type { WatchedTarget } from './external-watch-types'

export function createExternalWatchEventHandler(
  findTarget: (
    worktreePath: string,
    runtimeEnvironmentId: string | null
  ) => WatchedTarget | undefined
): {
  dispose: () => void
  handleFsChanged: (payload: FsChangedPayload, runtimeEnvironmentId?: string | null) => void
} {
  const mutationTracker = createExternalMutationTracker()
  const handleFsChanged = (
    payload: FsChangedPayload,
    runtimeEnvironmentId: string | null = null
  ): void => {
    const target = findTarget(payload.worktreePath, runtimeEnvironmentId)
    if (!target) {
      return
    }
    dispatchWorktreeFileChange(payload, target.runtimeEnvironmentId)
    mutationTracker.record(payload, target)
    const changedFiles = collectChangedFiles(payload, target)
    if (changedFiles.size > 0) {
      scheduleExternalReloads(target, changedFiles)
    }
  }
  return { dispose: mutationTracker.dispose, handleFsChanged }
}

function dispatchWorktreeFileChange(
  payload: FsChangedPayload,
  runtimeEnvironmentId: string | null
): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }
  window.dispatchEvent(
    new CustomEvent<WorktreeFileChangeEventDetail>(AGENTSTART_WORKTREE_FILE_CHANGE_EVENT, {
      detail: { payload, runtimeEnvironmentId }
    })
  )
}

function collectChangedFiles(payload: FsChangedPayload, target: WatchedTarget): Set<string> {
  const changedFiles = new Set<string>()
  for (const event of payload.events) {
    if (event.kind === 'overflow') {
      for (const notification of getOverflowExternalReloadTargets(target)) {
        scheduleDebouncedExternalReload(notification)
      }
      break
    }
    if (event.kind === 'delete' || (event.kind === 'update' && event.isDirectory === true)) {
      continue
    }
    const relativePath = getExternalFileChangeRelativePath(
      target.worktreePath,
      event.absolutePath,
      event.isDirectory
    )
    if (relativePath) {
      changedFiles.add(relativePath)
    }
  }
  return changedFiles
}

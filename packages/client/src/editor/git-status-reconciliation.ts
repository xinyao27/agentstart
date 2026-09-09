import type {
  GitConflictKind,
  GitStatusEntry,
  GitUpstreamStatus
} from '@yiru/protocol/git/status-types'

import { toOpenConflictMetadata } from './conflict-metadata'
import type { OpenFile } from './file-model'

export function areGitStatusEntriesEqual(prev: GitStatusEntry[], next: GitStatusEntry[]): boolean {
  return (
    prev.length === next.length &&
    prev.every(
      (entry, index) =>
        entry.path === next[index].path &&
        entry.status === next[index].status &&
        entry.area === next[index].area &&
        entry.oldPath === next[index].oldPath &&
        entry.conflictKind === next[index].conflictKind &&
        entry.conflictStatus === next[index].conflictStatus &&
        entry.conflictStatusSource === next[index].conflictStatusSource &&
        entry.added === next[index].added &&
        entry.removed === next[index].removed
    )
  )
}

export function areTrackedConflictMapsEqual(
  prev: Record<string, GitConflictKind>,
  next: Record<string, GitConflictKind>
): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  return prevKeys.length === nextKeys.length && prevKeys.every((key) => prev[key] === next[key])
}

export function areUpstreamStatusesEqual(
  prev: GitUpstreamStatus | undefined,
  next: GitUpstreamStatus
): boolean {
  return (
    prev !== undefined &&
    prev.hasUpstream === next.hasUpstream &&
    prev.upstreamName === next.upstreamName &&
    prev.ahead === next.ahead &&
    prev.behind === next.behind &&
    prev.hasConfiguredPushTarget === next.hasConfiguredPushTarget &&
    prev.behindCommitsArePatchEquivalent === next.behindCommitsArePatchEquivalent
  )
}

export function reconcileOpenFilesForStatus(
  openFiles: OpenFile[],
  worktreeId: string,
  nextEntries: GitStatusEntry[]
): OpenFile[] {
  const entriesByPath = new Map(nextEntries.map((entry) => [entry.path, entry]))
  let changed = false
  const nextOpenFiles = openFiles.flatMap((file) => {
    if (file.worktreeId !== worktreeId) {
      return [file]
    }
    if (file.mode === 'conflict-review' || file.mode === 'check-details') {
      return [file]
    }
    const entry = entriesByPath.get(file.relativePath)
    if (!file.conflict) {
      return [file]
    }
    if (!entry || !entry.conflictKind || !entry.conflictStatus || !entry.conflictStatusSource) {
      changed = true
      return file.conflict.kind === 'conflict-placeholder' ? [] : [{ ...file, conflict: undefined }]
    }
    const nextConflict = toOpenConflictMetadata(entry)
    if (!nextConflict) {
      return [file]
    }
    if (
      file.conflict.kind === nextConflict.kind &&
      file.conflict.conflictKind === nextConflict.conflictKind &&
      file.conflict.conflictStatus === nextConflict.conflictStatus &&
      file.conflict.conflictStatusSource === nextConflict.conflictStatusSource &&
      file.conflict.message === nextConflict.message &&
      file.conflict.guidance === nextConflict.guidance
    ) {
      return [file]
    }
    changed = true
    return [{ ...file, conflict: nextConflict }]
  })
  return changed ? nextOpenFiles : openFiles
}

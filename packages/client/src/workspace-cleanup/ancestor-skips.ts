import type { WorkspaceCleanupCandidate } from '@yiru/protocol'
import { isPathInsideOrEqual, normalizeRuntimePathForComparison } from '@yiru/protocol/host/path'
import { translate } from '~renderer/i18n/i18n'
import type { WorkspaceCleanupFailure } from '~renderer/workspace-cleanup/state'

// Why: an ancestor skip is provisional while every blocking descendant is still
// removing; it hardens or lifts once the blockers settle authoritatively.
export type SkippedWorkspaceCleanupAncestor = {
  candidate: WorkspaceCleanupCandidate
  failure: WorkspaceCleanupFailure
  provisional: boolean
}

export function getSkippedAncestorMessage(provisional: boolean): string {
  return provisional
    ? translate(
        'auto.components.workspace.cleanup.backgroundRemoval.skippedPendingAncestor',
        'Skipped because a nested workspace has not finished removing.'
      )
    : translate(
        'auto.components.workspace.cleanup.backgroundRemoval.skippedAncestor',
        'Skipped because a nested workspace could not be removed.'
      )
}

export function isStrictWorkspaceCleanupDescendant(
  parent: WorkspaceCleanupCandidate,
  child: WorkspaceCleanupCandidate
): boolean {
  // Why: WorkspaceCleanupCandidate.connectionId always derives from
  // Repo.connectionId, which is dead — nothing sets it since remote hosts
  // were removed (#63) — so every candidate shares the same (null) connection.
  return isStrictWorkspaceCleanupDescendantPath(parent.path, child.path)
}

function isStrictWorkspaceCleanupDescendantPath(parentPath: string, childPath: string): boolean {
  return (
    normalizeRuntimePathForComparison(parentPath) !==
      normalizeRuntimePathForComparison(childPath) && isPathInsideOrEqual(parentPath, childPath)
  )
}

import type { Repo } from '../../project/repository.js'
import type { DetectedWorktree, DetectedWorktreeListResult } from '../model.js'
import {
  effectiveExternalWorktreeVisibility,
  isLegacyRepoForExternalWorktreeVisibility
} from './ownership.js'
import { normalizeExternalWorktreeInboxPath } from './paths.js'

export function getHiddenExternalWorktrees(
  detected: DetectedWorktreeListResult | undefined
): DetectedWorktree[] {
  if (detected?.authoritative !== true) {
    return []
  }
  return detected.worktrees.filter(
    (worktree) =>
      !worktree.visible && !worktree.selectedCheckout && worktree.ownership !== 'yiru-managed'
  )
}

export function isExternalWorktreeDiscoverySuppressed(
  repo: Pick<Repo, 'externalWorktreeDiscoverySuppressedAt'>
): boolean {
  return typeof repo.externalWorktreeDiscoverySuppressedAt === 'number'
}

export function hasCompletedInitialExternalWorktreeImportPrompt(
  repo: Pick<Repo, 'externalWorktreeVisibilityPromptDismissedAt'>
): boolean {
  return typeof repo.externalWorktreeVisibilityPromptDismissedAt === 'number'
}

export function shouldOfferNewExternalWorktreeInbox(repo: Repo): boolean {
  if (isExternalWorktreeDiscoverySuppressed(repo)) {
    return false
  }
  if (!hasCompletedInitialExternalWorktreeImportPrompt(repo)) {
    return false
  }
  return (
    effectiveExternalWorktreeVisibility(repo, isLegacyRepoForExternalWorktreeVisibility(repo)) ===
    'hide'
  )
}

export function getNewExternalWorktreeInboxWorktrees(
  detected: DetectedWorktreeListResult | undefined,
  repo: Repo
): DetectedWorktree[] {
  if (!shouldOfferNewExternalWorktreeInbox(repo)) {
    return []
  }
  const baseline = new Set(
    (repo.externalWorktreeInboxBaselinePaths ?? []).map((path) =>
      normalizeExternalWorktreeInboxPath(path)
    )
  )
  return getHiddenExternalWorktrees(detected).filter(
    (worktree) => !baseline.has(normalizeExternalWorktreeInboxPath(worktree.path))
  )
}

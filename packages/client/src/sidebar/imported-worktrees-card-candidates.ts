import type { Repo } from '@yiru/protocol/project/repository'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import { getHiddenExternalWorktrees } from '@yiru/protocol/worktree/external/inbox'
import {
  effectiveExternalWorktreeVisibility,
  isLegacyRepoForExternalWorktreeVisibility
} from '@yiru/protocol/worktree/external/ownership'
import type { DetectedWorktreeListResult, Worktree } from '@yiru/protocol/worktree/model'

import type { ImportedWorktreesCardCandidate } from './worktree-list/groups'

export function getHiddenImportedWorktrees(
  detected: DetectedWorktreeListResult | undefined
): ReturnType<typeof getHiddenExternalWorktrees> {
  return getHiddenExternalWorktrees(detected)
}

export function buildImportedWorktreesCardCandidates(args: {
  repos: readonly Repo[]
  visibleWorktrees?: readonly Worktree[]
  detectedWorktreesByRepo?: Readonly<Record<string, DetectedWorktreeListResult | undefined>>
  getDetectedWorktrees?: (repo: Repo) => DetectedWorktreeListResult | undefined
  filterRepoIds?: readonly string[]
  forceVisibleRepoIds?: ReadonlySet<string>
}): Map<string, ImportedWorktreesCardCandidate> {
  const visibleRepoIds = args.visibleWorktrees
    ? new Set(args.visibleWorktrees.map((worktree) => worktree.repoId))
    : null
  const filterRepoIds = args.filterRepoIds?.length ? new Set(args.filterRepoIds) : null
  const candidates = new Map<string, ImportedWorktreesCardCandidate>()
  for (const repo of args.repos) {
    if (filterRepoIds && !filterRepoIds.has(repo.id)) {
      continue
    }
    if (visibleRepoIds && !visibleRepoIds.has(repo.id)) {
      continue
    }
    if (!isGitRepoKind(repo)) {
      continue
    }
    if (typeof repo.externalWorktreeVisibilityPromptDismissedAt === 'number') {
      continue
    }
    const visibility = effectiveExternalWorktreeVisibility(
      repo,
      isLegacyRepoForExternalWorktreeVisibility(repo)
    )
    if (visibility !== 'hide' && !args.forceVisibleRepoIds?.has(repo.id)) {
      continue
    }
    const hiddenWorktrees = getHiddenImportedWorktrees(
      args.getDetectedWorktrees?.(repo) ?? args.detectedWorktreesByRepo?.[repo.id]
    )
    if (hiddenWorktrees.length > 0) {
      candidates.set(repo.id, { repo, hiddenWorktrees })
    }
  }
  return candidates
}

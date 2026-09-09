import type { Repo } from '@yiru/protocol/project/repository'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import { getNewExternalWorktreeInboxWorktrees } from '@yiru/protocol/worktree/external/inbox'
import type {
  DetectedWorktree,
  DetectedWorktreeListResult,
  Worktree
} from '@yiru/protocol/worktree/model'

import type { NewExternalWorktreesInboxCandidate } from './worktree-list/groups'

export function buildNewExternalWorktreesInboxCandidates(args: {
  repos: readonly Repo[]
  visibleWorktrees?: readonly Worktree[]
  detectedWorktreesByRepo: Readonly<Record<string, DetectedWorktreeListResult | undefined>>
  filterRepoIds?: readonly string[]
}): Map<string, NewExternalWorktreesInboxCandidate> {
  const visibleRepoIds = args.visibleWorktrees
    ? new Set(args.visibleWorktrees.map((worktree) => worktree.repoId))
    : null
  const filterRepoIds = args.filterRepoIds?.length ? new Set(args.filterRepoIds) : null
  const candidates = new Map<string, NewExternalWorktreesInboxCandidate>()
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
    const inboxWorktrees = getNewExternalWorktreeInboxWorktrees(
      args.detectedWorktreesByRepo[repo.id],
      repo
    )
    if (inboxWorktrees.length > 0) {
      candidates.set(repo.id, { repo, inboxWorktrees })
    }
  }
  return candidates
}

export type NewExternalWorktreeInboxPreview = Pick<
  DetectedWorktree,
  'id' | 'displayName' | 'path' | 'branch'
>

export function toNewExternalWorktreeInboxPreview(
  worktree: DetectedWorktree
): NewExternalWorktreeInboxPreview {
  return {
    id: worktree.id,
    displayName: worktree.displayName,
    path: worktree.path,
    branch: worktree.branch
  }
}

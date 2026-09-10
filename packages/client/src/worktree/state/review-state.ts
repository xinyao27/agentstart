import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'
import type { Worktree, WorktreeMeta } from '@agentstart/protocol/worktree/model'
import { updateProjectCatalogWorktree } from '~renderer/project-catalog/worktree-cache'
import { branchName } from '~renderer/source-control/branch-name'

export type HostedReviewLinkKey = 'linkedPR'

const HOSTED_REVIEW_LINK_KEYS: readonly HostedReviewLinkKey[] = ['linkedPR']

export const CLEARED_HOSTED_REVIEW_LINK_UPDATES: Pick<
  WorktreeMeta,
  HostedReviewLinkKey | 'pushTarget'
> = {
  linkedPR: null,
  pushTarget: undefined
}

const hostedReviewLinkMutationGenerationByWorktreeId = new Map<string, number>()
export const hostedReviewLinkClearTombstonesByWorktreeId = new Map<
  string,
  { branch: string; branchIdentity: string; generation: number; head?: string }
>()
const hostedReviewLinkWorktreeIdAliases = new Map<string, string>()

function hasHostedReviewLinks(worktree: Worktree): boolean {
  return HOSTED_REVIEW_LINK_KEYS.some((key) => worktree[key] != null)
}

export function hasBranchScopedHostedReviewContext(worktree: Worktree): boolean {
  return hasHostedReviewLinks(worktree) || worktree.pushTarget !== undefined
}

export function hasHostedReviewLinkUpdates(updates: Partial<WorktreeMeta>): boolean {
  return HOSTED_REVIEW_LINK_KEYS.some((key) => key in updates) || 'pushTarget' in updates
}

export function getHostedReviewLinkMutationGeneration(worktreeId: string): number {
  return hostedReviewLinkMutationGenerationByWorktreeId.get(worktreeId) ?? 0
}

export function bumpHostedReviewLinkMutationGeneration(worktreeId: string): void {
  hostedReviewLinkMutationGenerationByWorktreeId.set(
    worktreeId,
    getHostedReviewLinkMutationGeneration(worktreeId) + 1
  )
  hostedReviewLinkClearTombstonesByWorktreeId.delete(worktreeId)
  pruneHostedReviewLinkWorktreeAliasesForId(worktreeId)
}

export function pruneHostedReviewLinkMutationGenerations(worktreeIds: Iterable<string>): void {
  for (const worktreeId of worktreeIds) {
    hostedReviewLinkMutationGenerationByWorktreeId.delete(worktreeId)
    hostedReviewLinkClearTombstonesByWorktreeId.delete(worktreeId)
    hostedReviewLinkWorktreeIdAliases.delete(worktreeId)
    for (const [oldWorktreeId, newWorktreeId] of hostedReviewLinkWorktreeIdAliases) {
      if (newWorktreeId === worktreeId) {
        hostedReviewLinkWorktreeIdAliases.delete(oldWorktreeId)
      }
    }
  }
}

export function resolveHostedReviewLinkWorktreeId(worktreeId: string): string {
  let current = worktreeId
  const seen = new Set<string>()
  while (!seen.has(current)) {
    seen.add(current)
    const next = hostedReviewLinkWorktreeIdAliases.get(current)
    if (!next) {
      return current
    }
    current = next
  }
  return worktreeId
}

function pruneHostedReviewLinkWorktreeAliasesForId(worktreeId: string): void {
  for (const [alias, target] of Array.from(hostedReviewLinkWorktreeIdAliases)) {
    if (
      alias === worktreeId ||
      target === worktreeId ||
      resolveHostedReviewLinkWorktreeId(alias) === worktreeId
    ) {
      hostedReviewLinkWorktreeIdAliases.delete(alias)
    }
  }
}

export function migrateHostedReviewLinkMutationGeneration(
  oldWorktreeId: string,
  newWorktreeId: string
): void {
  const tombstone = hostedReviewLinkClearTombstonesByWorktreeId.get(oldWorktreeId)
  for (const [alias, target] of hostedReviewLinkWorktreeIdAliases) {
    if (target === oldWorktreeId) {
      if (tombstone) {
        hostedReviewLinkWorktreeIdAliases.set(alias, newWorktreeId)
      } else {
        hostedReviewLinkWorktreeIdAliases.delete(alias)
      }
    }
  }
  const hasGeneration = hostedReviewLinkMutationGenerationByWorktreeId.has(oldWorktreeId)
  if (tombstone) {
    hostedReviewLinkWorktreeIdAliases.set(oldWorktreeId, newWorktreeId)
  }
  if (hasGeneration) {
    hostedReviewLinkMutationGenerationByWorktreeId.set(
      newWorktreeId,
      getHostedReviewLinkMutationGeneration(oldWorktreeId)
    )
    hostedReviewLinkMutationGenerationByWorktreeId.delete(oldWorktreeId)
  }
  if (tombstone) {
    hostedReviewLinkClearTombstonesByWorktreeId.set(newWorktreeId, tombstone)
    hostedReviewLinkClearTombstonesByWorktreeId.delete(oldWorktreeId)
  }
}

export function hostedReviewLinksAreCleared(worktree: Worktree): boolean {
  return HOSTED_REVIEW_LINK_KEYS.every((key) => worktree[key] == null) && !worktree.pushTarget
}

export function getHostedReviewLinkUpdates(
  worktree: Worktree
): Pick<WorktreeMeta, HostedReviewLinkKey | 'pushTarget'> {
  return {
    linkedPR: worktree.linkedPR ?? null,
    pushTarget: worktree.pushTarget
  }
}

export function canonicalHostedReviewBranchIdentity(branch: string): string {
  return branchName(branch).trim()
}

export function rememberHostedReviewLinkClear(
  worktreeId: string,
  branch: string,
  generation: number,
  head?: string
): void {
  hostedReviewLinkClearTombstonesByWorktreeId.set(worktreeId, {
    branch,
    branchIdentity: canonicalHostedReviewBranchIdentity(branch),
    generation,
    head
  })
}

export function applyHostedReviewLinkClear(worktreeId: string): void {
  updateProjectCatalogWorktree(worktreeId, CLEARED_HOSTED_REVIEW_LINK_UPDATES)
}

export function clearOlderHostedReviewLinksForReplacement(
  updates: Partial<WorktreeMeta>,
  _existingWorktree: Worktree
): Partial<WorktreeMeta> {
  return updates
}

export function getHostedReviewLinkForMetaRefresh(
  updates: Partial<WorktreeMeta>,
  existingWorktree: Worktree | undefined,
  key: HostedReviewLinkKey
): number | null {
  return Object.prototype.hasOwnProperty.call(updates, key)
    ? (updates[key] ?? null)
    : (existingWorktree?.[key] ?? null)
}

function hasExplicitPushTargetClear(updates: Partial<WorktreeMeta>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(updates, 'pushTarget') && updates.pushTarget === undefined
  )
}

export type RuntimeWorktreeMetaUpdates = Omit<Partial<WorktreeMeta>, 'pushTarget'> & {
  pushTarget?: GitPushTarget | null
}

export function encodePushTargetClearForRuntimeRpc(
  updates: Partial<WorktreeMeta>
): RuntimeWorktreeMetaUpdates {
  if (!hasExplicitPushTargetClear(updates)) {
    return updates
  }
  // Why: remote runtime RPC is JSON-shaped and drops undefined fields, so use
  // null as the wire-only signal for clearing persisted pushTarget metadata.
  return { ...updates, pushTarget: null }
}

// Every worktree-id-keyed store map the rename path re-keys on a folder move, so a
// new `*ByWorktree` map is not silently missed when a worktree id changes. Maps keyed
// by tab id or file id are deliberately NOT here — tabs and files keep their ids across
// a worktree rename.

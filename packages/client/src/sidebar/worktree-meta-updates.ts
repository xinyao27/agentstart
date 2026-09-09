import type { WorktreeMeta } from '@yiru/protocol/worktree/model'
import { parseGitHubPullRequestLink, parseGitHubPullRequestNumber } from '~renderer/github/links'

export type WorktreeMetaSavedPayload = {
  worktreeId: string
  updates: Partial<WorktreeMeta>
}

export function parseGitHubWorkItemNumberForMetaField(
  input: string,
  expectedType: 'pr'
): number | null {
  const link = parseGitHubPullRequestLink(input)
  if (link) {
    return expectedType === 'pr' ? link.number : null
  }
  return parseGitHubPullRequestNumber(input)
}

/** Empty input clears the review link; invalid input leaves it unchanged. */
export function buildWorktreeMetaUpdates(args: {
  displayNameInput: string
  currentDisplayName: string
  prInput: string
  commentInput: string
}): Partial<WorktreeMeta> {
  const trimmedPR = args.prInput.trim()
  const linkedPRNumber = parseGitHubWorkItemNumberForMetaField(trimmedPR, 'pr')
  const finalLinkedPR =
    trimmedPR === '' ? null : linkedPRNumber !== null ? linkedPRNumber : undefined
  const trimmedDisplayName = args.displayNameInput.trim()
  const updates: Partial<WorktreeMeta> = {
    comment: args.commentInput.trim(),
    ...(trimmedDisplayName !== args.currentDisplayName && {
      displayName: trimmedDisplayName || undefined
    })
  }
  if (finalLinkedPR !== undefined) {
    updates.linkedPR = finalLinkedPR
  }
  return updates
}

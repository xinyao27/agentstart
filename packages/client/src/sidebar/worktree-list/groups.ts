import { appendProjectGroupTree } from '../project-group-tree'
import { withRepoSectionDisplayLabels } from '../project-row-order'
import { buildOrderedWorktreeGroups } from '../worktree-group-collection'
import {
  appendUngroupedWorktrees,
  createWorktreeRowContext,
  getPinnedWorktreeDisplayPolicy
} from '../worktree-row-context'
import { appendOrderedGroups } from '../worktree-section-emission'
import type { BuildRowsOptions, Row } from './rows'

export { getGroupKeysForWorktree } from '../worktree-group-keys'
export {
  ALL_GROUP_KEY,
  getLineageGroupKey,
  getLineageRenderInfo,
  getProjectGroupHeaderKey,
  PINNED_GROUP_KEY
} from '../worktree-group-metadata'
export type {
  BuildRowsOptions,
  GroupHeaderRow,
  ImportedWorktreesCardCandidate,
  ImportedWorktreesCardRow,
  NewExternalWorktreesInboxCandidate,
  NewExternalWorktreesInboxRow,
  PendingCreationRow,
  PinnedWorktreeDisplayPolicy,
  ProjectGroupingModel,
  Row,
  WorktreeGroupBy,
  WorktreeRow
} from './rows'
export { getPinnedWorktreeDisplayPolicy }

export function buildRows(options: BuildRowsOptions): Row[] {
  const context = createWorktreeRowContext(options)
  if (appendUngroupedWorktrees(context)) {
    return context.result
  }
  const orderedGroups = buildOrderedWorktreeGroups(context)
  if (appendProjectGroupTree(context, orderedGroups)) {
    return context.result
  }
  appendOrderedGroups(
    context,
    context.groupBy === 'repo' ? withRepoSectionDisplayLabels(orderedGroups) : orderedGroups
  )
  return context.result
}

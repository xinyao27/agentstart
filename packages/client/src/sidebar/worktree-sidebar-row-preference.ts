import { folderWorkspaceToWorktree } from '@yiru/protocol/workspace/folder'
import type { Worktree } from '@yiru/protocol/worktree/model'

import type { HostSectionRow } from './host-section-rows'
import {
  PINNED_GROUP_KEY,
  type PinnedWorktreeDisplayPolicy,
  type WorktreeRow
} from './worktree-list/groups'

export function getPreferredWorktreeRows(
  rows: readonly WorktreeRow[],
  pinnedDisplayPolicy: PinnedWorktreeDisplayPolicy
): WorktreeRow[] {
  if (pinnedDisplayPolicy === 'single-location') {
    const seen = new Set<string>()
    return rows.filter((row) => {
      if (seen.has(row.worktree.id)) {
        return false
      }
      seen.add(row.worktree.id)
      return true
    })
  }

  // Why: a duplicated pinned workspace is one navigation target; prefer the
  // natural row and fall back to Pinned when collapse/filtering hides it.
  const preferred: WorktreeRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.sectionKey === PINNED_GROUP_KEY || seen.has(row.worktree.id)) {
      continue
    }
    preferred.push(row)
    seen.add(row.worktree.id)
  }
  for (const row of rows) {
    if (seen.has(row.worktree.id)) {
      continue
    }
    preferred.push(row)
    seen.add(row.worktree.id)
  }
  return preferred
}

export function getRenderedWorktreesInSidebarOrder(
  rows: readonly HostSectionRow[],
  pinnedDisplayPolicy: PinnedWorktreeDisplayPolicy
): Worktree[] {
  const itemRows = rows.filter((row): row is WorktreeRow => row.type === 'item')
  const preferredRowKeys = new Set(
    getPreferredWorktreeRows(itemRows, pinnedDisplayPolicy).map((row) => row.rowKey)
  )
  const rendered: Worktree[] = []
  for (const row of rows) {
    if (row.type === 'item' && preferredRowKeys.has(row.rowKey)) {
      rendered.push(row.worktree)
    } else if (row.type === 'folder-workspace') {
      rendered.push(folderWorkspaceToWorktree(row.folderWorkspace))
    }
  }
  return rendered
}

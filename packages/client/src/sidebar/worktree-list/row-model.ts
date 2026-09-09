import { folderWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { shallow } from 'zustand/shallow'

import type { HostSectionRow } from '../host-section-rows'
import type { ImportedWorktreeCardActionState } from '../imported-worktrees-card-actions'
import type { WorkspaceSidebarProjectedRow } from '../workspace-sidebar-row-projection'
import type { WorktreeDragGroup } from '../worktree-manual-order'
import { ALL_GROUP_KEY, getLineageGroupKey, PINNED_GROUP_KEY, type Row } from './groups'
import { getWorktreeOptionId } from './reveal'
import type { RenderRow } from './virtual-rows'

export type WorktreeItemRow = Extract<HostSectionRow, { type: 'item' }>
export type FolderWorkspaceItemRow = Extract<HostSectionRow, { type: 'folder-workspace' }>

function isWorktreeItemRow(row: HostSectionRow): row is WorktreeItemRow {
  return row.type === 'item'
}

export function renderRowContainsWorktree(row: RenderRow, worktreeId: string | null): boolean {
  if (worktreeId === null) {
    return false
  }
  if (row.type === 'folder-workspace') {
    return folderWorkspaceKey(row.folderWorkspace.id) === worktreeId
  }
  if (row.type === 'lineage-group') {
    return row.rows.some((item) => item.worktree.id === worktreeId)
  }
  return row.type === 'item' && row.worktree.id === worktreeId
}

export function getRenderRowOptionId(
  row: RenderRow | undefined,
  worktreeId?: string | null
): string | undefined {
  if (!row) {
    return undefined
  }
  if (row.type === 'lineage-group') {
    const targetRow = worktreeId ? row.rows.find((item) => item.worktree.id === worktreeId) : null
    return getWorktreeOptionId((targetRow ?? row.rows[0])?.rowKey ?? row.key)
  }
  if (row.type === 'item') {
    return getWorktreeOptionId(row.rowKey)
  }
  if (row.type === 'folder-workspace') {
    return getWorktreeOptionId(folderWorkspaceKey(row.folderWorkspace.id))
  }
  return undefined
}

function renderRowContainsNaturalWorktree(row: RenderRow, worktreeId: string): boolean {
  if (row.type === 'lineage-group') {
    return row.rows.some(
      (item) => item.worktree.id === worktreeId && item.sectionKey !== PINNED_GROUP_KEY
    )
  }
  return (
    row.type === 'item' && row.worktree.id === worktreeId && row.sectionKey !== PINNED_GROUP_KEY
  )
}

export function findPreferredRenderRowIndexForWorktree(
  renderRows: readonly RenderRow[],
  worktreeId: string,
  preferNaturalRow: boolean
): number {
  let fallbackIndex = -1
  for (let index = 0; index < renderRows.length; index += 1) {
    const row = renderRows[index]
    if (!renderRowContainsWorktree(row, worktreeId)) {
      continue
    }
    if (fallbackIndex === -1) {
      fallbackIndex = index
    }
    if (preferNaturalRow && renderRowContainsNaturalWorktree(row, worktreeId)) {
      return index
    }
  }
  return fallbackIndex
}

export type ActiveDescendantInput = {
  activeWorktreeId: string | null
  primaryActiveRowKey?: string
  workspaceRows: readonly WorkspaceSidebarProjectedRow[]
}

export function getActiveDescendantOptionId(
  args: ActiveDescendantInput & { visibleIndexes: readonly number[] }
): string | undefined {
  if (args.activeWorktreeId === null) {
    return undefined
  }
  if (args.primaryActiveRowKey) {
    const primaryOptionId = getWorktreeOptionId(args.primaryActiveRowKey)
    for (const index of args.visibleIndexes) {
      const projected = args.workspaceRows[index]
      const row = projected?.kind === 'local' ? projected.row : undefined
      if (row && getRenderRowOptionId(row, args.activeWorktreeId) === primaryOptionId) {
        return primaryOptionId
      }
    }
  }
  for (const index of args.visibleIndexes) {
    const projected = args.workspaceRows[index]
    const row = projected?.kind === 'local' ? projected.row : undefined
    if (row && renderRowContainsNaturalWorktree(row, args.activeWorktreeId)) {
      return getRenderRowOptionId(row, args.activeWorktreeId)
    }
  }
  for (const index of args.visibleIndexes) {
    const projected = args.workspaceRows[index]
    const row = projected?.kind === 'local' ? projected.row : undefined
    if (row && renderRowContainsWorktree(row, args.activeWorktreeId)) {
      return getRenderRowOptionId(row, args.activeWorktreeId)
    }
  }
  return undefined
}

export function uniqueWorktreeIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids))
}

export function buildRenderableRows(rows: HostSectionRow[]): RenderRow[] {
  const renderRows: RenderRow[] = []
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    if (
      !isWorktreeItemRow(row) ||
      row.lineageChildCount === 0 ||
      row.lineageCollapsed ||
      rows[index + 1]?.type !== 'item' ||
      (rows[index + 1] as WorktreeItemRow).depth <= row.depth
    ) {
      renderRows.push(row)
      continue
    }
    const groupRows: WorktreeItemRow[] = [row]
    let cursor = index + 1
    while (cursor < rows.length) {
      const child = rows[cursor]
      if (!isWorktreeItemRow(child) || child.depth <= row.depth) {
        break
      }
      groupRows.push(child)
      cursor++
    }
    renderRows.push({
      type: 'lineage-group',
      key: `${row.sectionKey}:${getLineageGroupKey(row.worktree.id)}`,
      rows: groupRows
    })
    index = cursor - 1
  }
  return renderRows
}

export function getRenderRowKey(row: RenderRow): string {
  if (row.type === 'host-header') {
    return `host:${row.hostId}`
  }
  if (row.type === 'header') {
    return `hdr:${row.key}`
  }
  if (row.type === 'lineage-group') {
    return `lineage-group:${row.key}`
  }
  if (row.type === 'imported-worktrees-card') {
    return `imported:${row.key}`
  }
  if (row.type === 'new-external-worktrees-inbox') {
    return `inbox:${row.key}`
  }
  if (row.type === 'pending-creation') {
    return `pending:${row.creationId}`
  }
  if (row.type === 'folder-workspace') {
    return `folder-workspace:${row.folderWorkspace.id}`
  }
  return `wt:${row.rowKey}`
}

export function getWorktreeDragGroups(rows: HostSectionRow[]): WorktreeDragGroup[] {
  const groups: WorktreeDragGroup[] = []
  const naturalWorktreeIds = new Set(
    rows.flatMap((row) =>
      row.type === 'item' && row.sectionKey !== PINNED_GROUP_KEY ? [row.worktree.id] : []
    )
  )
  let current: { key: string; ids: string[] } | null = null
  for (const row of rows) {
    if (row.type === 'header') {
      current = { key: row.key, ids: [] }
      groups.push({ key: current.key, worktreeIds: current.ids })
      continue
    }
    if (
      row.type === 'host-header' ||
      row.type === 'imported-worktrees-card' ||
      row.type === 'new-external-worktrees-inbox' ||
      row.type === 'pending-creation' ||
      row.type === 'folder-workspace'
    ) {
      continue
    }
    if (row.sectionKey === PINNED_GROUP_KEY && naturalWorktreeIds.has(row.worktree.id)) {
      continue
    }
    if (!current) {
      current = { key: ALL_GROUP_KEY, ids: [] }
      groups.push({ key: current.key, worktreeIds: current.ids })
    }
    current.ids.push(row.worktree.id)
  }
  return groups.filter((group) => group.worktreeIds.length > 0)
}

export function canKeepImportedWorktreesHidden(
  row: Extract<Row, { type: 'imported-worktrees-card' }>,
  actionState: ImportedWorktreeCardActionState | undefined
): boolean {
  return row.placement === 'repo-group' && actionState?.forceVisible !== true
}

export function getWorktreeDragIndexes(rows: readonly HostSectionRow[]): {
  groupKeyByRowKey: Map<string, string>
  groupIndexByRowKey: Map<string, number>
} {
  const groupKeyByRowKey = new Map<string, string>()
  const groupIndexByRowKey = new Map<string, number>()
  const groupIndexes = new Map<string, number>()
  const naturalWorktreeIds = new Set(
    rows.flatMap((row) =>
      row.type === 'item' && row.sectionKey !== PINNED_GROUP_KEY ? [row.worktree.id] : []
    )
  )
  for (const row of rows) {
    if (row.type === 'header') {
      groupIndexes.set(row.key, 0)
      continue
    }
    if (row.type !== 'item') {
      continue
    }
    if (row.sectionKey === PINNED_GROUP_KEY && naturalWorktreeIds.has(row.worktree.id)) {
      continue
    }
    const index = groupIndexes.get(row.sectionKey) ?? 0
    groupKeyByRowKey.set(row.rowKey, row.sectionKey)
    groupIndexByRowKey.set(row.rowKey, index)
    groupIndexes.set(row.sectionKey, index + 1)
  }
  return { groupKeyByRowKey, groupIndexByRowKey }
}

export function getLegendListRowType(row: WorkspaceSidebarProjectedRow): string {
  return row.kind === 'local' ? `local:${row.row.type}` : row.kind
}

export function areWorkspaceSidebarRowsEqual(
  previous: WorkspaceSidebarProjectedRow,
  current: WorkspaceSidebarProjectedRow
): boolean {
  if (previous.kind !== current.kind || previous.key !== current.key) {
    return false
  }
  return previous.localIndex === current.localIndex && shallow(previous.row, current.row)
}

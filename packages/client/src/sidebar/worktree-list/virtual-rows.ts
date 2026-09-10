import type { HostSectionRow } from '../host-section-rows'
import { PINNED_GROUP_KEY } from './groups'

// Why: project headers share the single-line workspace row box (see
// project-header.tsx / worktree-card/surface.tsx); keep this in sync or the
// virtualizer seeds every header slot at the wrong height.
export const GROUP_HEADER_ROW_HEIGHT = 30
const HOST_HEADER_ROW_HEIGHT = 32
const SECONDARY_GROUP_HEADER_TOP_MARGIN = 4
const IMPORTED_WORKTREES_LINE_ROW_HEIGHT = 36
const PENDING_CREATION_ROW_HEIGHT = 56
const FOLDER_WORKSPACE_ROW_HEIGHT = 64

type WorktreeItemRow = Extract<HostSectionRow, { type: 'item' }>
type StickySectionRow = { type: string; projectGroupDepth?: number }
export type RenderRow =
  | HostSectionRow
  | { type: 'lineage-group'; key: string; rows: WorktreeItemRow[] }

export function shouldUseHeaderTopSpacing(args: {
  rows: readonly RenderRow[]
  index: number
  firstHeaderIndex: number
}): boolean {
  const previousRenderRow = args.rows[args.index - 1]
  const followsCollapsedPinnedHeader =
    previousRenderRow?.type === 'header' && previousRenderRow.key === PINNED_GROUP_KEY
  return args.index !== args.firstHeaderIndex && !followsCollapsedPinnedHeader
}

export function estimateRenderRowSize(
  rows: readonly RenderRow[],
  index: number,
  firstHeaderIndex: number,
  _activeStickyHeaderIndex: number | null
): number {
  const row = rows[index]
  if (row?.type === 'host-header') {
    return (
      HOST_HEADER_ROW_HEIGHT +
      (shouldUseHeaderTopSpacing({
        rows,
        index,
        firstHeaderIndex
      })
        ? SECONDARY_GROUP_HEADER_TOP_MARGIN
        : 0)
    )
  }
  if (row?.type === 'header') {
    return (
      GROUP_HEADER_ROW_HEIGHT +
      (shouldUseHeaderTopSpacing({
        rows,
        index,
        firstHeaderIndex
      })
        ? SECONDARY_GROUP_HEADER_TOP_MARGIN
        : 0)
    )
  }
  if (row?.type === 'lineage-group') {
    return 100 + Math.max(0, row.rows.length - 1) * 96
  }
  if (row?.type === 'imported-worktrees-card' || row?.type === 'new-external-worktrees-inbox') {
    return IMPORTED_WORKTREES_LINE_ROW_HEIGHT
  }
  if (row?.type === 'pending-creation') {
    return PENDING_CREATION_ROW_HEIGHT
  }
  if (row?.type === 'folder-workspace') {
    return FOLDER_WORKSPACE_ROW_HEIGHT
  }
  return 116
}

export function getStickyHeaderIndexes(rows: readonly StickySectionRow[]): number[] {
  const indexes: number[] = []
  rows.forEach((row, index) => {
    // Why: project groups are the top-level repo sidebar context; nested repo
    // headers should not replace their containing group as the pinned header.
    if (
      row.type === 'host-header' ||
      (row.type === 'header' && (row.projectGroupDepth ?? 0) === 0)
    ) {
      indexes.push(index)
    }
  })
  return indexes
}

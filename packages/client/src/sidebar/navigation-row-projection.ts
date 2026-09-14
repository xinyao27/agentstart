import type { RenderRow } from './worktree-list/virtual-rows'
import { estimateRenderRowSize } from './worktree-list/virtual-rows'

export type NavigationProjectedRow = {
  kind: 'local'
  key: string
  localIndex: number
  row: RenderRow
}

export function projectNavigationRows(args: {
  localRows: readonly RenderRow[]
  getLocalRowKey: (row: RenderRow) => string
}): NavigationProjectedRow[] {
  return args.localRows.map((row, localIndex) => ({
    kind: 'local',
    key: args.getLocalRowKey(row),
    localIndex,
    row
  }))
}

export function workspaceIndexForLocalRowIndex(
  rows: readonly NavigationProjectedRow[],
  localIndex: number
): number {
  return rows.findIndex((row) => row.localIndex === localIndex)
}

export function getNavigationRowKey(row: NavigationProjectedRow): string {
  return row.key
}

export function estimateNavigationRowSize(args: {
  rows: readonly NavigationProjectedRow[]
  localRows: readonly RenderRow[]
  index: number
  firstLocalHeaderIndex: number
  activeStickyHeaderIndex: number | null
}): number {
  const projected = args.rows[args.index]
  if (!projected) {
    return 32
  }
  return estimateRenderRowSize(
    args.localRows,
    projected.localIndex,
    args.firstLocalHeaderIndex,
    args.activeStickyHeaderIndex
  )
}

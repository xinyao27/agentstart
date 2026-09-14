import { estimateNavigationRowSize, type NavigationProjectedRow } from './navigation-row-projection'
import type { RenderRow } from './worktree-list/virtual-rows'

function getEstimatedWorkspaceRowStarts(
  rows: readonly NavigationProjectedRow[],
  localRows: readonly RenderRow[],
  firstLocalHeaderIndex: number
): number[] {
  const starts: number[] = []
  let offset = 0
  for (let index = 0; index < rows.length; index++) {
    starts[index] = offset
    offset += estimateNavigationRowSize({
      rows,
      localRows,
      index,
      firstLocalHeaderIndex,
      activeStickyHeaderIndex: null
    })
  }
  starts[rows.length] = offset
  return starts
}

function localRowAt(row: NavigationProjectedRow | undefined): RenderRow | undefined {
  return row?.kind === 'local' ? row.row : undefined
}

function findRepoHeaderRowIndex(rows: readonly NavigationProjectedRow[], repoId: string): number {
  return rows.findIndex((projected) => {
    const row = localRowAt(projected)
    return row?.type === 'header' && row.repo?.id === repoId
  })
}

function findProjectGroupHeaderRowIndex(
  rows: readonly NavigationProjectedRow[],
  groupId: string
): number {
  return rows.findIndex((projected) => {
    const row = localRowAt(projected)
    return (
      row?.type === 'header' &&
      !row.repo &&
      typeof row.projectGroup?.id === 'string' &&
      row.projectGroup.id === groupId
    )
  })
}

function findNextHeaderRowIndex(
  rows: readonly NavigationProjectedRow[],
  startIndex: number
): number {
  for (let index = startIndex; index < rows.length; index++) {
    const row = localRowAt(rows[index])
    if (row?.type === 'header' || row?.type === 'host-header') {
      return index
    }
  }
  return rows.length
}

function findProjectGroupSectionEndIndex(
  rows: readonly NavigationProjectedRow[],
  startIndex: number,
  depth: number
): number {
  for (let index = startIndex; index < rows.length; index++) {
    const row = localRowAt(rows[index])
    if (!row) {
      continue
    }
    if (row.type === 'host-header') {
      return index
    }
    if (row.type !== 'header') {
      continue
    }
    const rowDepth = row.projectGroupDepth ?? 0
    if (rowDepth <= depth || (!row.repo && !row.projectGroup)) {
      return index
    }
  }
  return rows.length
}

export function getRepoHeaderSectionEndByRepoId(args: {
  rows: readonly NavigationProjectedRow[]
  localRows: readonly RenderRow[]
  firstLocalHeaderIndex: number
  sidebarRepoHeaderIdsByBucket: ReadonlyMap<string, readonly string[]>
  repoHeaderBucketByRepoId: ReadonlyMap<string, string>
}): Map<string, number> {
  const rowStarts = getEstimatedWorkspaceRowStarts(
    args.rows,
    args.localRows,
    args.firstLocalHeaderIndex
  )
  const sectionEndByRepoId = new Map<string, number>()
  for (let index = 0; index < args.rows.length; index++) {
    const row = localRowAt(args.rows[index])
    const repoId = row?.type === 'header' ? row.repo?.id : undefined
    if (!repoId) {
      continue
    }
    const bucketKey = args.repoHeaderBucketByRepoId.get(repoId)
    const bucketRepoIds = bucketKey ? args.sidebarRepoHeaderIdsByBucket.get(bucketKey) : undefined
    const bucketIndex = bucketRepoIds?.indexOf(repoId) ?? -1
    const nextRepoId = bucketIndex >= 0 ? bucketRepoIds?.[bucketIndex + 1] : undefined
    const endIndex = nextRepoId
      ? findRepoHeaderRowIndex(args.rows, nextRepoId)
      : findNextHeaderRowIndex(args.rows, index + 1)
    sectionEndByRepoId.set(
      repoId,
      rowStarts[endIndex >= 0 ? endIndex : args.rows.length] ?? rowStarts[args.rows.length] ?? 0
    )
  }
  return sectionEndByRepoId
}

export function getProjectGroupHeaderSectionEndByGroupId(args: {
  rows: readonly NavigationProjectedRow[]
  localRows: readonly RenderRow[]
  firstLocalHeaderIndex: number
  sidebarProjectGroupHeaderIdsByBucket: ReadonlyMap<string, readonly string[]>
  projectGroupHeaderBucketByGroupId: ReadonlyMap<string, string>
}): Map<string, number> {
  const rowStarts = getEstimatedWorkspaceRowStarts(
    args.rows,
    args.localRows,
    args.firstLocalHeaderIndex
  )
  const sectionEndByGroupId = new Map<string, number>()
  for (let index = 0; index < args.rows.length; index++) {
    const row = localRowAt(args.rows[index])
    const projectGroupHeader =
      row?.type === 'header' &&
      !row.repo &&
      row.projectGroup &&
      typeof row.projectGroup.id === 'string'
        ? { row, groupId: row.projectGroup.id }
        : null
    const groupId = projectGroupHeader?.groupId
    if (!groupId) {
      continue
    }
    const bucketKey = args.projectGroupHeaderBucketByGroupId.get(groupId)
    const bucketGroupIds = bucketKey
      ? args.sidebarProjectGroupHeaderIdsByBucket.get(bucketKey)
      : undefined
    const bucketIndex = bucketGroupIds?.indexOf(groupId) ?? -1
    const nextGroupId = bucketIndex >= 0 ? bucketGroupIds?.[bucketIndex + 1] : undefined
    const depth = projectGroupHeader.row.projectGroupDepth ?? 0
    const endIndex = nextGroupId
      ? findProjectGroupHeaderRowIndex(args.rows, nextGroupId)
      : findProjectGroupSectionEndIndex(args.rows, index + 1, depth)
    sectionEndByGroupId.set(
      groupId,
      rowStarts[endIndex >= 0 ? endIndex : args.rows.length] ?? rowStarts[args.rows.length] ?? 0
    )
  }
  return sectionEndByGroupId
}

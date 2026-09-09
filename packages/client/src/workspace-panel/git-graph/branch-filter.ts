import type { GitHistoryItem } from '@yiru/protocol/git/history-types'

export type GitGraphBranchOption = {
  refId: string
  name: string
  category: 'branches' | 'remote branches'
  isCheckedOut?: boolean
}

// Why: the branch filter can only walk ancestry within the commits this graph
// already loaded (skip-based pagination, not a re-scoped git log), so it
// collects branch/remote-branch refs from the loaded page rather than asking
// the backend for the repository's full ref list.
export function collectGitGraphBranchOptions(
  items: readonly GitHistoryItem[]
): GitGraphBranchOption[] {
  const byRefId = new Map<string, GitGraphBranchOption>()
  for (const item of items) {
    for (const ref of item.references ?? []) {
      if (ref.category !== 'branches' && ref.category !== 'remote branches') {
        continue
      }
      if (byRefId.has(ref.id)) {
        continue
      }
      byRefId.set(ref.id, {
        refId: ref.id,
        name: ref.name,
        category: ref.category,
        isCheckedOut: ref.isCheckedOut
      })
    }
  }
  return Array.from(byRefId.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function findRefTipCommitId(items: readonly GitHistoryItem[], refId: string): string | undefined {
  for (const item of items) {
    if (item.references?.some((ref) => ref.id === refId)) {
      return item.id
    }
  }
  return undefined
}

// Why: single-pass DFS with a visited set (not a check-every-pair scan) keeps
// this O(commits + parent-edges) regardless of how large the loaded page is.
// A selected tip's real ancestry can extend past the loaded page (skip-based
// paging), so this only ever walks parent ids that are themselves in `items`
// — it deliberately under-reports rather than guessing at unloaded history.
export function computeGitGraphAncestorIds(
  items: readonly GitHistoryItem[],
  selectedRefIds: readonly string[]
): Set<string> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const visited = new Set<string>()
  const queue: string[] = []
  for (const refId of selectedRefIds) {
    const tipId = findRefTipCommitId(items, refId)
    if (tipId) {
      queue.push(tipId)
    }
  }
  while (queue.length > 0) {
    const id = queue.pop()!
    if (visited.has(id)) {
      continue
    }
    visited.add(id)
    const item = byId.get(id)
    if (!item) {
      continue
    }
    for (const parentId of item.parentIds) {
      if (byId.has(parentId) && !visited.has(parentId)) {
        queue.push(parentId)
      }
    }
  }
  return visited
}

// Why: `null` is "no filter" and returns the loaded page untouched. A
// non-null selection (including an empty array — every branch deselected)
// keeps only commits reachable from the selected tips within the *loaded*
// page. Because ancestry can reach past the loaded page, an empty result
// here means "no match found yet in what's loaded", not "this branch has no
// commits" — callers must keep offering Load More rather than reading this
// as the complete filtered history.
export function filterGitGraphItemsByBranches(
  items: readonly GitHistoryItem[],
  selectedRefIds: readonly string[] | null
): readonly GitHistoryItem[] {
  if (selectedRefIds === null) {
    return items
  }
  const ancestorIds = computeGitGraphAncestorIds(items, selectedRefIds)
  return items.filter((item) => ancestorIds.has(item.id))
}

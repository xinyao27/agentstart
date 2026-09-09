import type { GitStatusEntry } from '@yiru/protocol/git/status-types'

// Why: resolving a collator for every O(n log n) comparison dominates large
// changed-file projections.
export const sourceControlPathCollator = new Intl.Collator(undefined, { numeric: true })

export function compareGitStatusEntries(a: GitStatusEntry, b: GitStatusEntry): number {
  return (
    getConflictSortRank(a) - getConflictSortRank(b) ||
    sourceControlPathCollator.compare(a.path, b.path)
  )
}

function getConflictSortRank(entry: GitStatusEntry): number {
  if (entry.conflictStatus === 'unresolved') {
    return 0
  }
  if (entry.conflictStatus === 'resolved_locally') {
    return 1
  }
  return 2
}

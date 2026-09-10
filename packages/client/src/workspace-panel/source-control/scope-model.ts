import type { GitBranchChangeEntry } from '@agentstart/protocol/git/branch-compare-types'
import type { GitStatusEntry } from '@agentstart/protocol/git/status-types'
import { translate } from '~renderer/i18n/i18n'

import { SECTION_LABELS } from './panel-constants'
import type { SourceControlDisplaySection } from './section-order'

// Why: the panel shows one of two worlds at a time — the working tree (whose
// staged/unstaged/untracked groups are levels inside the tree) or the commits
// this branch is ahead by.
export type SourceControlScopeId = 'uncommitted' | 'branch'

export type SourceControlScopeOption = {
  id: SourceControlScopeId
  label: string
  count: number
  added: number
  removed: number
  conflictCount: number
}

const BRANCH_SCOPE_LABEL = {
  key: 'auto.components.right.sidebar.SourceControl.d7ae61269b',
  fallback: 'Committed on Branch'
}

function sumDiffLines(entries: readonly { added?: number; removed?: number }[]): {
  added: number
  removed: number
} {
  let added = 0
  let removed = 0
  for (const entry of entries) {
    added += entry.added ?? 0
    removed += entry.removed ?? 0
  }
  return { added, removed }
}

function countUnresolvedConflicts(entries: readonly GitStatusEntry[]): number {
  return entries.filter((entry) => entry.conflictStatus === 'unresolved').length
}

export function buildSourceControlScopeOptions({
  displaySections,
  branchEntries
}: {
  displaySections: readonly SourceControlDisplaySection[]
  branchEntries: readonly GitBranchChangeEntry[]
}): SourceControlScopeOption[] {
  const options: SourceControlScopeOption[] = []
  const uncommittedEntries = displaySections.flatMap((section) => section.items)
  if (uncommittedEntries.length > 0) {
    options.push({
      id: 'uncommitted',
      label: translate(SECTION_LABELS.unstaged.key, SECTION_LABELS.unstaged.fallback),
      count: uncommittedEntries.length,
      ...sumDiffLines(uncommittedEntries),
      conflictCount: countUnresolvedConflicts(uncommittedEntries)
    })
  }
  if (branchEntries.length > 0) {
    options.push({
      id: 'branch',
      label: translate(BRANCH_SCOPE_LABEL.key, BRANCH_SCOPE_LABEL.fallback),
      count: branchEntries.length,
      ...sumDiffLines(branchEntries),
      conflictCount: 0
    })
  }
  return options
}

// Why: the selection is a preference, not a source of truth — a scope that
// empties out (committed everything, switched branch) must fall back to the
// first available scope instead of leaving the panel blank.
export function resolveSourceControlActiveScope(
  options: readonly SourceControlScopeOption[],
  selectedScopeId: SourceControlScopeId | null
): SourceControlScopeOption | null {
  const selected = selectedScopeId
    ? options.find((option) => option.id === selectedScopeId)
    : undefined
  return selected ?? options[0] ?? null
}

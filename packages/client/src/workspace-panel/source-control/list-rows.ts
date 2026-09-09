import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'

import type { SourceControlDisplaySection, SourceControlDisplaySectionId } from './section-order'
import type { RenderableSubmoduleListItem } from './submodule-expansion'

// Why: list view is one flat, virtualized list so the panel keeps a single
// scroller — the working-tree groups are rows in that list, not separate lists.
export type SourceControlListRow =
  | { kind: 'group'; key: string; section: SourceControlDisplaySection }
  | {
      kind: 'uncommitted'
      key: string
      sectionId: SourceControlDisplaySectionId
      entry: GitStatusEntry
    }
  | {
      kind: 'submodule-placeholder'
      key: string
      depth: number
      state: 'loading' | 'empty' | 'error'
      message?: string
    }
  | { kind: 'branch'; key: string; entry: GitBranchChangeEntry }

export type SourceControlListModel = {
  rows: SourceControlListRow[]
  stickyHeaderIndices: number[]
}

export function buildSourceControlUncommittedListModel({
  displaySections,
  collapsedSections,
  visibleListRowsBySection
}: {
  displaySections: readonly SourceControlDisplaySection[]
  collapsedSections: ReadonlySet<string>
  visibleListRowsBySection: Partial<
    Record<SourceControlDisplaySectionId, RenderableSubmoduleListItem[]>
  >
}): SourceControlListModel {
  const rows: SourceControlListRow[] = []
  const stickyHeaderIndices: number[] = []
  for (const section of displaySections) {
    stickyHeaderIndices.push(rows.length)
    rows.push({ kind: 'group', key: `group:${section.id}`, section })
    if (collapsedSections.has(section.id)) {
      continue
    }
    for (const row of visibleListRowsBySection[section.id] ?? []) {
      if (row.type === 'submodule-placeholder') {
        rows.push({
          kind: 'submodule-placeholder',
          key: row.key,
          depth: row.depth,
          state: row.state,
          message: row.message
        })
        continue
      }
      rows.push({
        kind: 'uncommitted',
        key: `${row.entry.area}::${row.entry.path}`,
        sectionId: section.id,
        entry: row.entry
      })
    }
  }
  return { rows, stickyHeaderIndices }
}

export function buildSourceControlBranchListModel(
  entries: readonly GitBranchChangeEntry[]
): SourceControlListModel {
  return {
    rows: entries.map((entry) => ({ kind: 'branch', key: `branch:${entry.path}`, entry })),
    stickyHeaderIndices: []
  }
}

export function getSourceControlListRowKey(row: SourceControlListRow): string {
  return row.key
}

export function getSourceControlListRowType(row: SourceControlListRow): string {
  return row.kind
}

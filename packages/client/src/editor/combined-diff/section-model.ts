import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'

export type CombinedDiffMode = 'all' | 'uncommitted' | 'branch' | 'commit'
export type CombinedDiffEntry = GitStatusEntry | GitBranchChangeEntry

// Why: the combined diff viewer is mounted by the editor surface, so outside
// panels ask it to reveal a section through a window event instead of reaching
// into its virtualizer state.
export const COMBINED_DIFF_REVEAL_SECTION_EVENT = 'yiru:combined-diff-reveal-section'

export type CombinedDiffRevealSectionRequest = {
  worktreeId: string
  entry: CombinedDiffEntry
}

export function getCombinedDiffEntrySectionKey(
  mode: CombinedDiffMode,
  entry: CombinedDiffEntry
): string {
  if ((mode === 'all' || mode === 'uncommitted') && 'area' in entry) {
    return `${entry.area}:${entry.path}`
  }
  return `${mode === 'commit' ? 'combined-commit' : 'combined-branch'}:${entry.path}`
}

export function createCombinedDiffSectionIndexMap(
  sections: readonly { key: string }[]
): Map<string, number> {
  return new Map(sections.map((section, index) => [section.key, index]))
}

export function getCombinedDiffSectionNavigationIndex({
  mode,
  entry,
  sectionIndexByKey
}: {
  mode: CombinedDiffMode
  entry: CombinedDiffEntry
  sectionIndexByKey: ReadonlyMap<string, number>
}): number | null {
  return sectionIndexByKey.get(getCombinedDiffEntrySectionKey(mode, entry)) ?? null
}

export function handleCombinedDiffSectionNavigation({
  mode,
  entry,
  sections,
  sectionIndexByKey,
  toggleSection,
  scrollToIndex
}: {
  mode: CombinedDiffMode
  entry: CombinedDiffEntry
  sections: readonly { collapsed: boolean }[]
  sectionIndexByKey: ReadonlyMap<string, number>
  toggleSection: (index: number) => void
  scrollToIndex: (index: number) => void
}): number | null {
  const index = getCombinedDiffSectionNavigationIndex({ mode, entry, sectionIndexByKey })
  if (index === null || !sections[index]) {
    return null
  }

  if (sections[index].collapsed) {
    toggleSection(index)
  }
  scrollToIndex(index)
  return index
}

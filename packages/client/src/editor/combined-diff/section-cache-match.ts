import type { GitBranchChangeEntry } from '@agentstart/protocol/git/branch-compare-types'
import type { GitStatusEntry } from '@agentstart/protocol/git/status-types'

import type { DiffSection } from '../diff-section/types'
import type { CombinedDiffMode } from './section-model'
import { getCombinedDiffEntrySectionKey } from './section-model'

export function combinedDiffSectionsMatchEntryMetadata({
  entries,
  sections,
  mode
}: {
  entries: readonly (GitStatusEntry | GitBranchChangeEntry)[]
  sections: readonly DiffSection[]
  mode: CombinedDiffMode
}): boolean {
  // Why: same-path combined sections can survive status refreshes; metadata
  // drift means restoring cached content would replay stale, partial diffs.
  return (
    sections.length === entries.length &&
    sections.every((section, index) => {
      const entry = entries[index]
      if (!entry) {
        return false
      }
      const entryArea = 'area' in entry ? entry.area : undefined
      const entryAdded = 'added' in entry ? entry.added : undefined
      const entryRemoved = 'removed' in entry ? entry.removed : undefined
      return (
        section.key === getCombinedDiffEntrySectionKey(mode, entry) &&
        section.status === entry.status &&
        section.area === entryArea &&
        section.oldPath === entry.oldPath &&
        section.added === entryAdded &&
        section.removed === entryRemoved
      )
    })
  )
}

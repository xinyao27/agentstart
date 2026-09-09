import type { GitStatusEntry } from '@yiru/protocol/git/status-types'

import { isStageableStatusEntry } from '../discard-all-sequence'

export function canStageStatusEntry(entry: GitStatusEntry): boolean {
  return isStageableStatusEntry(entry)
}

export function canUnstageStatusEntry(entry: GitStatusEntry): boolean {
  return entry.area === 'staged' && !entry.submoduleRoot
}

export function canDiscardStatusEntry(entry: GitStatusEntry): boolean {
  return (
    entry.conflictStatus !== 'unresolved' &&
    entry.conflictStatus !== 'resolved_locally' &&
    !entry.submoduleRoot &&
    (entry.area === 'unstaged' || entry.area === 'untracked')
  )
}

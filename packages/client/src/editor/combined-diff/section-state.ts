import type { GitStatusEntry } from '@agentstart/protocol/git/status-types'

import type { DiffSection } from '../diff-section/types'
import type { CombinedDiffModel } from './model'
import { combinedDiffSectionsMatchEntryMetadata } from './section-cache-match'
import { getCombinedDiffEntrySectionKey } from './section-model'
import {
  buildCombinedGitStatusSignature,
  combinedDiffPreferences,
  getCombinedDiffViewState
} from './view-state'

export type InitialCombinedDiffSectionState = {
  loadedIndices: Set<number>
  sections: DiffSection[]
  sideBySide?: boolean
}

type ResolveInitialSectionStateOptions = Pick<
  CombinedDiffModel,
  | 'combinedMode'
  | 'entries'
  | 'entrySignature'
  | 'hasUncommittedEntriesSnapshot'
  | 'shouldAutoReloadFromGitStatus'
> & {
  gitStatusEntries: GitStatusEntry[]
  viewStateKey: string
}

export function resolveInitialCombinedDiffSectionState({
  combinedMode,
  entries,
  entrySignature,
  gitStatusEntries,
  hasUncommittedEntriesSnapshot,
  shouldAutoReloadFromGitStatus,
  viewStateKey
}: ResolveInitialSectionStateOptions): InitialCombinedDiffSectionState {
  const cached = getCombinedDiffViewState(viewStateKey)
  const canRestoreSnapshotSectionsByKey =
    hasUncommittedEntriesSnapshot &&
    cached !== undefined &&
    combinedDiffSectionsMatchEntryMetadata({
      entries,
      sections: cached.sections,
      mode: combinedMode
    })
  const canRestore =
    cached &&
    (cached.entrySignature === entrySignature || canRestoreSnapshotSectionsByKey) &&
    (!shouldAutoReloadFromGitStatus ||
      cached.gitStatusSignature ===
        buildCombinedGitStatusSignature(cached.sections, gitStatusEntries)) &&
    (cached.sections.length > 0 || entries.length === 0)

  if (canRestore && cached) {
    const collapsedPreference = combinedDiffPreferences.getCollapsed()
    const sections =
      collapsedPreference === null
        ? cached.sections
        : cached.sections.map((section) => ({ ...section, collapsed: collapsedPreference }))
    return {
      sections,
      loadedIndices: new Set(cached.loadedIndices.filter((index) => !sections[index]?.loading)),
      sideBySide: combinedDiffPreferences.hasSideBySide()
        ? combinedDiffPreferences.getSideBySide()
        : cached.sideBySide
    }
  }

  return {
    sections: entries.map((entry) => ({
      key: getCombinedDiffEntrySectionKey(combinedMode, entry),
      path: entry.path,
      status: entry.status,
      area: 'area' in entry ? entry.area : undefined,
      oldPath: entry.oldPath,
      added: 'added' in entry ? entry.added : undefined,
      removed: 'removed' in entry ? entry.removed : undefined,
      originalContent: '',
      modifiedContent: '',
      // Why: combined diff starts as a file list; rows load only when expanded.
      collapsed: combinedDiffPreferences.getCollapsed() ?? true,
      loading: true,
      error: undefined,
      dirty: false,
      diffResult: null,
      largeDiffRenderLimit: null
    })),
    loadedIndices: new Set()
  }
}

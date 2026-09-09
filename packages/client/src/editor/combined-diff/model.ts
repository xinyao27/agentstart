import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'

import type { OpenFile } from '../state'
import {
  getCombinedBranchEntries,
  getCombinedUncommittedEntries,
  resolveCombinedUncommittedSnapshotEntries,
  shouldAutoReloadCombinedDiffFromGitStatus
} from './entries'
import type { CombinedDiffEntry, CombinedDiffMode } from './section-model'

export type CombinedDiffModel = {
  branchCompare: NonNullable<OpenFile['branchCompare']> | null
  combinedMode: CombinedDiffMode
  commitCompare: NonNullable<OpenFile['commitCompare']> | null
  entries: CombinedDiffEntry[]
  entrySignature: string
  hasUncommittedEntriesSnapshot: boolean
  isAllMode: boolean
  isBranchMode: boolean
  isCommitMode: boolean
  shouldAutoReloadFromGitStatus: boolean
}

type ResolveCombinedDiffModelOptions = {
  file: OpenFile
  gitStatusEntries: GitStatusEntry[]
  liveBranchEntries: GitBranchChangeEntry[]
  retainedResolvedEntries: GitStatusEntry[]
}

export function resolveCombinedDiffModel({
  file,
  gitStatusEntries,
  liveBranchEntries,
  retainedResolvedEntries
}: ResolveCombinedDiffModelOptions): CombinedDiffModel {
  const isBranchMode = file.diffSource === 'combined-branch'
  const isCommitMode = file.diffSource === 'combined-commit'
  const isAllMode = file.diffSource === 'combined-all'
  const branchCompare =
    file.branchCompare?.baseOid && file.branchCompare.headOid && file.branchCompare.mergeBase
      ? file.branchCompare
      : null
  const commitCompare = file.commitCompare?.commitOid ? file.commitCompare : null
  const snapshotEntries = file.uncommittedEntriesSnapshot?.filter(
    (entry) => entry.conflictStatus !== 'unresolved'
  )
  const uncommittedEntries = snapshotEntries
    ? resolveCombinedUncommittedSnapshotEntries(
        snapshotEntries,
        gitStatusEntries,
        retainedResolvedEntries
      )
    : getCombinedUncommittedEntries(gitStatusEntries, file.combinedAreaFilter)
  const branchEntries = getCombinedBranchEntries(file.branchEntriesSnapshot, liveBranchEntries)
  const renderableBranchEntries = branchCompare ? branchEntries : []
  const commitEntries = file.commitEntriesSnapshot ?? []
  const allEntries: CombinedDiffEntry[] = [...uncommittedEntries, ...renderableBranchEntries]
  const entries: CombinedDiffEntry[] = isAllMode
    ? allEntries
    : isBranchMode
      ? renderableBranchEntries
      : isCommitMode
        ? commitEntries
        : uncommittedEntries
  const combinedMode: CombinedDiffMode = isAllMode
    ? 'all'
    : isBranchMode
      ? 'branch'
      : isCommitMode
        ? 'commit'
        : 'uncommitted'
  const hasUncommittedEntriesSnapshot = file.uncommittedEntriesSnapshot !== undefined
  const shouldAutoReloadFromGitStatus = shouldAutoReloadCombinedDiffFromGitStatus({
    mode: combinedMode,
    hasUncommittedEntriesSnapshot
  })
  const entrySignature = JSON.stringify({
    mode: file.diffSource,
    areaFilter: file.combinedAreaFilter ?? null,
    compareVersion: file.branchCompare?.compareVersion ?? null,
    commitVersion: file.commitCompare?.compareVersion ?? null,
    compare:
      isBranchMode && branchCompare
        ? {
            baseOid: branchCompare.baseOid,
            headOid: branchCompare.headOid,
            mergeBase: branchCompare.mergeBase
          }
        : null,
    commit:
      isCommitMode && commitCompare
        ? {
            commitOid: commitCompare.commitOid,
            parentOid: commitCompare.parentOid ?? null
          }
        : null,
    entries: entries.map((entry) => ({
      path: entry.path,
      status: entry.status,
      oldPath: entry.oldPath ?? null,
      area: 'area' in entry ? entry.area : null,
      added: 'added' in entry ? (entry.added ?? null) : null,
      removed: 'removed' in entry ? (entry.removed ?? null) : null
    }))
  })

  return {
    branchCompare,
    combinedMode,
    commitCompare,
    entries,
    entrySignature,
    hasUncommittedEntriesSnapshot,
    isAllMode,
    isBranchMode,
    isCommitMode,
    shouldAutoReloadFromGitStatus
  }
}

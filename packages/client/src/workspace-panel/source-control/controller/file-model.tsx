import { useEffect, useState } from 'react'

import type { GitStatusSourceControlTreeNode } from '../directory-action-paths'
import {
  filterSourceControlGroupedPathEntries,
  filterSourceControlPathEntries,
  getSourceControlFileFilterState
} from '../file-filter'
import {
  EMPTY_BRANCH_CHANGE_ENTRIES,
  SUBMODULE_EMPTY_LABEL,
  SUBMODULE_LOADING_LABEL
} from '../panel-constants'
import { deriveSourceControlPushRecovery } from '../push-recovery'
import { buildSourceControlScopeOptions, resolveSourceControlActiveScope } from '../scope-model'
import {
  buildSourceControlDisplaySections,
  SOURCE_CONTROL_AREAS,
  type SourceControlDisplaySectionId,
  type SourceControlEntryGroups
} from '../section-order'
import { compareGitStatusEntries } from '../status-sort'
import {
  injectExpandedSubmoduleEntries,
  injectExpandedSubmoduleRows,
  type RenderableSourceControlNode,
  type RenderableSubmoduleListItem
} from '../submodule-expansion'
import {
  buildGitStatusSourceControlTree,
  buildSourceControlTree,
  applyGitStatusEntryAreasToSourceControlTree,
  flattenSourceControlTree,
  namespaceSourceControlTreeDirectoryKeys
} from '../tree'
import type { SourceControlHostedReviewStateController } from './hosted-review-state'

export function useSourceControlFileModel(scope: SourceControlHostedReviewStateController) {
  const {
    activeRemoteActionSequence,
    activeRepo,
    activeWorktree,
    activeWorktreeId,
    branchEntries,
    branchName,
    branchSummary,
    collapsedSections,
    collapsedTreeDirs,
    enqueueGitHubPRRefresh,
    entries,
    expandedSubmoduleKeys,
    fallbackGitHubPRNumber,
    fetchHostedReviewForBranch,
    filterQuery,
    isBranchVisible,
    isFolder,
    linkedGitHubPR,
    remoteActionError,
    selectedScopeId,
    sourceControlGroupOrder,
    sourceControlViewMode,
    submoduleStatusByKey,
    worktreePath
  } = scope
  useEffect(() => {
    if (
      !isBranchVisible ||
      !activeRepo ||
      isFolder ||
      !branchName ||
      branchName === 'HEAD' ||
      !activeWorktreeId
    ) {
      return
    }
    // Why: terminal checkouts must immediately refresh the displayed review;
    // retain a known number because fork/deleted-head branch lookup is lossy.
    void fetchHostedReviewForBranch(activeRepo.path, branchName, {
      repoId: activeRepo.id,
      linkedGitHubPR,
      fallbackGitHubPR: fallbackGitHubPRNumber,
      staleWhileRevalidate: true
    })
    // Why: the GitHub-specific cache powers grouping/check panels; keep that
    // refresh behind the coordinator so Source Control does not bypass pacing.
    enqueueGitHubPRRefresh(activeWorktreeId, 'swr', 30)
  }, [
    activeRepo,
    activeWorktreeId,
    branchName,
    enqueueGitHubPRRefresh,
    fetchHostedReviewForBranch,
    isBranchVisible,
    isFolder,
    linkedGitHubPR,
    fallbackGitHubPRNumber
  ])
  const grouped = (() => {
    const groups: SourceControlEntryGroups = { staged: [], unstaged: [], untracked: [] }
    for (const entry of entries) {
      groups[entry.area].push(entry)
    }
    for (const area of SOURCE_CONTROL_AREAS) {
      groups[area].sort(compareGitStatusEntries)
    }
    return groups
  })()
  const fileFilterState = (() => getSourceControlFileFilterState(filterQuery))()
  const normalizedFilter = fileFilterState.normalizedFilter
  const filteredGrouped = (() => filterSourceControlGroupedPathEntries(grouped, fileFilterState))()
  const displaySections = (() =>
    buildSourceControlDisplaySections(filteredGrouped, sourceControlGroupOrder))()
  const unfilteredDisplaySections = (() =>
    buildSourceControlDisplaySections(grouped, sourceControlGroupOrder))()
  const unfilteredDisplaySectionsById = (() =>
    new Map(unfilteredDisplaySections.map((section) => [section.id, section])))()
  const filteredBranchEntries = (() =>
    filterSourceControlPathEntries(branchEntries, fileFilterState))()
  const isBranchScopeAvailable = Boolean(
    branchSummary?.status === 'ready' &&
    filteredBranchEntries.length > 0 &&
    activeWorktree &&
    worktreePath
  )
  const scopeOptions = (() =>
    buildSourceControlScopeOptions({
      displaySections,
      branchEntries: isBranchScopeAvailable ? filteredBranchEntries : EMPTY_BRANCH_CHANGE_ENTRIES
    }))()
  const activeScope = resolveSourceControlActiveScope(scopeOptions, selectedScopeId)
  const activeScopeId = activeScope?.id ?? null
  const treeRootsBySection = (() => {
    const roots: Partial<Record<SourceControlDisplaySectionId, GitStatusSourceControlTreeNode[]>> =
      {}
    for (const section of displaySections) {
      const sectionRoots = buildGitStatusSourceControlTree(section.area, section.items)
      roots[section.id] =
        section.id === 'conflicts'
          ? applyGitStatusEntryAreasToSourceControlTree(
              // Why: conflict rows can mirror normal paths, so their folder
              // collapse keys must not share state with normal area sections.
              namespaceSourceControlTreeDirectoryKeys(sectionRoots, 'conflicts')
            )
          : sectionRoots
    }
    return roots
  })()
  const visibleTreeRowsBySection = (() => {
    const rows: Partial<Record<SourceControlDisplaySectionId, RenderableSourceControlNode[]>> = {}
    for (const section of displaySections) {
      rows[section.id] = injectExpandedSubmoduleRows(
        flattenSourceControlTree(treeRootsBySection[section.id] ?? [], collapsedTreeDirs),
        expandedSubmoduleKeys,
        submoduleStatusByKey,
        SUBMODULE_LOADING_LABEL,
        SUBMODULE_EMPTY_LABEL
      )
    }
    return rows
  })()
  const visibleListRowsBySection = (() => {
    const rows: Partial<Record<SourceControlDisplaySectionId, RenderableSubmoduleListItem[]>> = {}
    for (const section of displaySections) {
      rows[section.id] = injectExpandedSubmoduleEntries(
        section.items,
        expandedSubmoduleKeys,
        submoduleStatusByKey,
        SUBMODULE_LOADING_LABEL,
        SUBMODULE_EMPTY_LABEL
      )
    }
    return rows
  })()
  const branchTreeRoots = (() => buildSourceControlTree('branch', filteredBranchEntries))()
  const visibleFileRowKeys = (() => {
    const keys = new Set<string>()
    // Why: the working-tree groups are only on screen in their own scope, so
    // open-file bookkeeping must stay empty while commits are shown.
    if (activeScopeId !== 'uncommitted') {
      return keys
    }
    // Why: open-file bookkeeping must use the same injected submodule rows
    // that the list view renders.
    if (sourceControlViewMode === 'list') {
      for (const section of displaySections) {
        if (collapsedSections.has(section.id)) {
          continue
        }
        for (const row of visibleListRowsBySection[section.id] ?? []) {
          if (row.type === 'entry') {
            keys.add(`${row.entry.area}::${row.entry.path}`)
          }
        }
      }
      return keys
    }

    for (const section of displaySections) {
      if (collapsedSections.has(section.id)) {
        continue
      }
      for (const node of visibleTreeRowsBySection[section.id] ?? []) {
        if (node.type === 'file') {
          keys.add(node.key)
        }
      }
    }
    return keys
  })()
  const [isExecutingBulk, setIsExecutingBulk] = useState(false)
  const unresolvedConflicts = (() =>
    entries.filter((entry) => entry.conflictStatus === 'unresolved' && entry.conflictKind))()
  const unresolvedConflictReviewEntries = (() =>
    unresolvedConflicts.map((entry) => ({
      path: entry.path,
      conflictKind: entry.conflictKind!
    })))()
  const pushRecovery = (() =>
    deriveSourceControlPushRecovery({
      actionError: remoteActionError,
      currentBranchName: branchName || null,
      currentSequence: activeRemoteActionSequence
    }))()
  return {
    ...scope,
    grouped,
    fileFilterState,
    normalizedFilter,
    filteredGrouped,
    displaySections,
    unfilteredDisplaySections,
    unfilteredDisplaySectionsById,
    filteredBranchEntries,
    scopeOptions,
    activeScope,
    activeScopeId,
    treeRootsBySection,
    visibleTreeRowsBySection,
    visibleListRowsBySection,
    branchTreeRoots,
    visibleFileRowKeys,
    isExecutingBulk,
    setIsExecutingBulk,
    unresolvedConflicts,
    unresolvedConflictReviewEntries,
    pushRecovery
  }
}

export type SourceControlFileModelController = ReturnType<typeof useSourceControlFileModel>

import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Repo } from '@yiru/protocol/project/repository'
import { folderWorkspaceKey } from '@yiru/protocol/workspace/identity'
import {
  effectiveExternalWorktreeVisibility,
  isLegacyRepoForExternalWorktreeVisibility
} from '@yiru/protocol/worktree/external/ownership'
import type React from 'react'

import { isRepoHeaderActionTarget } from '../project-header-drag'
import { revealElementInScrollContainer } from '../worktree-sidebar-reveal'
import type { ProjectGroupingModel } from './groups'
import { getProjectGroupHeaderKey } from './groups'
import type { RenderRow } from './virtual-rows'

export function resolvePendingSidebarReveal(args: {
  targetIndex: number
  targetWorktreeStillExists: boolean
}): 'scroll-and-clear' | 'clear' | 'keep-pending' {
  if (args.targetIndex !== -1) {
    return 'scroll-and-clear'
  }
  return args.targetWorktreeStillExists ? 'keep-pending' : 'clear'
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  // Why: xterm's hidden textarea is terminal input, so app-level workspace
  // shortcuts must remain reachable while it owns focus.
  if (target.classList.contains('xterm-helper-textarea')) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return (
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
    null
  )
}

export function stopRepoHeaderKeyboardToggle(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.stopPropagation()
  }
}

export function stopNestedWorktreeCardBubble(event: React.SyntheticEvent<HTMLElement>): void {
  event.stopPropagation()
}

export function handleRepoHeaderActionPointerDown(event: React.PointerEvent<HTMLElement>): void {
  event.stopPropagation()
}

export function handleRepoHeaderCollapseAffordancePointerDown(
  event: React.PointerEvent<HTMLElement>
): void {
  // Why: repo-header drag arms from the row press surface; collapse clicks
  // must not promote into a drag session.
  event.stopPropagation()
}

export function stopRepoHeaderMenuEvent(event: React.SyntheticEvent<HTMLElement>): void {
  event.stopPropagation()
}

export function shouldIgnoreRepoHeaderToggle(event: React.SyntheticEvent<HTMLElement>): boolean {
  return isRepoHeaderActionTarget(event.target, event.currentTarget)
}

export function getWorktreeOptionId(rowKey: string): string {
  return `worktree-list-option-${encodeURIComponent(rowKey)}`
}

function getMountedWorktreeOptions(worktreeId: string, root?: ParentNode | null): HTMLElement[] {
  const scope = root ?? document
  const result: HTMLElement[] = []
  scope.querySelectorAll<HTMLElement>('[data-worktree-id]').forEach((element) => {
    if (element.dataset.worktreeId === worktreeId) {
      result.push(element)
    }
  })
  return result
}

export function revealMountedWorktreeElement(
  container: HTMLElement,
  worktreeId: string,
  behavior: ScrollBehavior,
  optionId?: string
): HTMLElement | null {
  const element = optionId
    ? document.getElementById(optionId)
    : getMountedWorktreeOptions(worktreeId, container)[0]
  if (!element || !container.contains(element)) {
    return null
  }
  return revealElementInScrollContainer(container, element, behavior) ? element : null
}

export function revealMountedSidebarRowElement(
  container: HTMLElement,
  rowKey: string,
  behavior: ScrollBehavior
): HTMLElement | null {
  const element = document.getElementById(getWorktreeOptionId(rowKey))
  if (!element || !container.contains(element)) {
    return null
  }
  return revealElementInScrollContainer(container, element, behavior) ? element : null
}

export function getRenderRowSidebarKey(row: RenderRow): string | null {
  if (row.type === 'header') {
    return row.key
  }
  if (row.type === 'item') {
    return row.rowKey
  }
  if (row.type === 'folder-workspace') {
    return folderWorkspaceKey(row.folderWorkspace.id)
  }
  if (row.type === 'pending-creation') {
    return `pending:${row.creationId}`
  }
  if (row.type === 'imported-worktrees-card' || row.type === 'new-external-worktrees-inbox') {
    return row.key
  }
  return null
}

export function rowKeyMatchesRenderRow(row: RenderRow, rowKey: string): boolean {
  if (row.type === 'lineage-group') {
    return row.rows.some((item) => item.rowKey === rowKey)
  }
  return getRenderRowSidebarKey(row) === rowKey
}

function getProjectIdFromHeaderRowKey(rowKey: string): string | null {
  if (!rowKey.startsWith('project:')) {
    return null
  }
  const withoutPrefix = rowKey.slice('project:'.length)
  const setupSeparator = withoutPrefix.indexOf('::setup:')
  return setupSeparator === -1 ? withoutPrefix : withoutPrefix.slice(0, setupSeparator)
}

export function getRepoIdsFromHeaderRowKey(
  rowKey: string,
  repoMap: Map<string, Repo>,
  projectGrouping?: ProjectGroupingModel
): string[] {
  if (rowKey.startsWith('repo:')) {
    return [rowKey.slice('repo:'.length)]
  }
  const setupMarker = '::setup:'
  const setupIndex = rowKey.indexOf(setupMarker)
  if (rowKey.startsWith('project:') && setupIndex !== -1) {
    return [rowKey.slice(setupIndex + setupMarker.length)]
  }
  const projectId = getProjectIdFromHeaderRowKey(rowKey)
  if (!projectId) {
    return []
  }
  const repoIds = new Set<string>()
  for (const setup of projectGrouping?.projectHostSetups ?? []) {
    if (setup.projectId === projectId && repoMap.has(setup.repoId)) {
      repoIds.add(setup.repoId)
    }
  }
  const project = projectGrouping?.projects.find((candidate) => candidate.id === projectId)
  for (const repoId of project?.sourceRepoIds ?? []) {
    if (repoMap.has(repoId)) {
      repoIds.add(repoId)
    }
  }
  return [...repoIds]
}

function getProjectGroupAncestorKeys(
  projectGroupId: string | null | undefined,
  projectGroups: readonly ProjectGroup[]
): string[] {
  const groupsById = new Map(projectGroups.map((group) => [group.id, group]))
  const keys: string[] = []
  const seen = new Set<string>()
  let currentGroupId = projectGroupId ?? null
  while (currentGroupId && !seen.has(currentGroupId)) {
    const group = groupsById.get(currentGroupId)
    if (!group) {
      break
    }
    seen.add(currentGroupId)
    keys.unshift(getProjectGroupHeaderKey(group.id))
    currentGroupId = group.parentGroupId
  }
  return keys
}

export function getSidebarRowRevealAncestorKeys(args: {
  rowKey: string
  repoMap: Map<string, Repo>
  projectGroups: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
}): string[] {
  if (args.rowKey.startsWith('project-group:')) {
    const groupId = args.rowKey.slice('project-group:'.length)
    const group = args.projectGroups.find((candidate) => candidate.id === groupId)
    return getProjectGroupAncestorKeys(group?.parentGroupId, args.projectGroups)
  }
  const keys = new Set<string>()
  for (const repoId of getRepoIdsFromHeaderRowKey(
    args.rowKey,
    args.repoMap,
    args.projectGrouping
  )) {
    const repo = args.repoMap.get(repoId)
    for (const key of getProjectGroupAncestorKeys(repo?.projectGroupId, args.projectGroups)) {
      keys.add(key)
    }
  }
  return [...keys]
}

export function getWorktreeVisibilityMenuLabel(repo: Repo): string {
  const visibility = effectiveExternalWorktreeVisibility(
    repo,
    isLegacyRepoForExternalWorktreeVisibility(repo)
  )
  return visibility === 'show' ? 'Hide non-Yiru worktrees' : 'Show hidden worktrees'
}

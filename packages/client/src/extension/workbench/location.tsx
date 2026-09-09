import type { WorkspacePanelTabContentType } from '@yiru/protocol/workspace/tabs'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { useEffect, useRef } from 'react'

import { useProjectCatalog } from '../../project-catalog/provider'
import { projectCatalogRepoKey } from '../../project-catalog/query'
import type { WorkbenchLocation, WorkbenchPage } from '../../runtime/workbench-location'
import { useAppStore } from '../../store/state'
import { showWorkspaceSidebar } from '../../workspace-panel/show-sidebar'
import { activateAndRevealWorktree } from '../../worktree/activation'
import { openCommandPalette } from '../command-palette/open'

export type WorkbenchRouteSearch = {
  panel?: WorkspacePanelTabContentType
  project?: string
  session?: string
  view?: WorkbenchPage
  worktree?: string
}

const EMPTY_WORKTREES: Worktree[] = []

export function validateWorkbenchRouteSearch(
  search: Record<string, unknown>
): WorkbenchRouteSearch {
  const page = parseWorkbenchPage(search.view)
  const panel = parseWorkbenchPanel(search.panel)
  const project = parseSearchValue(search.project)
  const session = parseSearchValue(search.session)
  const worktree = parseSearchValue(search.worktree)
  return {
    ...(page ? { view: page } : {}),
    ...(panel ? { panel } : {}),
    ...(project ? { project } : {}),
    ...(session ? { session } : {}),
    ...(worktree ? { worktree } : {})
  }
}

export function workbenchLocationFromSearch(search: WorkbenchRouteSearch): WorkbenchLocation {
  const page = search.view
  if (page) {
    return { kind: 'page', page }
  }
  const projectId = search.project
  if (!projectId) {
    return { kind: 'page', page: 'activity' }
  }
  return {
    kind: 'project',
    projectId,
    ...(search.panel ? { panel: search.panel } : {}),
    ...(search.worktree ? { worktreeId: search.worktree } : {}),
    ...(search.session ? { sessionId: search.session } : {})
  }
}

export function workbenchSearchFromLocation(location: WorkbenchLocation): WorkbenchRouteSearch {
  if (location.kind === 'workbench') {
    return {}
  }
  if (location.kind === 'page') {
    return { view: location.page }
  }
  return {
    project: location.projectId,
    ...(location.panel ? { panel: location.panel } : {}),
    ...(location.sessionId ? { session: location.sessionId } : {}),
    ...(location.worktreeId ? { worktree: location.worktreeId } : {})
  }
}

function parseSearchValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseWorkbenchPage(value: unknown): WorkbenchPage | null {
  switch (value) {
    case 'activity':
    case 'automations':
    case 'mobile':
    case 'search':
    case 'settings':
    case 'skills':
      return value
    default:
      return null
  }
}

function parseWorkbenchPanel(value: unknown): WorkspacePanelTabContentType | null {
  switch (value) {
    case 'explorer':
    case 'vault':
    case 'workspaces':
    case 'pr-checks':
    case 'source-control':
    case 'ports':
      return value
    default:
      return null
  }
}

export function ExtensionWorkbenchLocationBridge({
  location
}: {
  location: WorkbenchLocation
}): null {
  const workspaceSessionReady = useAppStore((state) => state.workspaceSessionReady)
  const catalog = useProjectCatalog()
  const routeRepo =
    location.kind === 'project'
      ? catalog.repos.find((repo) => repo.id === location.projectId)
      : undefined
  const worktrees = routeRepo
    ? (catalog.worktreesByRepo[projectCatalogRepoKey(routeRepo)] ?? EMPTY_WORKTREES)
    : EMPTY_WORKTREES
  const unifiedTabsByWorktree = useAppStore((state) => state.unifiedTabsByWorktree)
  const locationKey = workbenchLocationKey(location)
  const appliedLocationKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!workspaceSessionReady || appliedLocationKeyRef.current === locationKey) {
      return
    }
    if (applyWorkbenchLocation(location, worktrees)) {
      appliedLocationKeyRef.current = locationKey
    }
  }, [location, locationKey, unifiedTabsByWorktree, workspaceSessionReady, worktrees])
  return null
}

function workbenchLocationKey(location: WorkbenchLocation): string {
  if (location.kind === 'workbench') {
    return location.kind
  }
  if (location.kind === 'page') {
    return `${location.kind}:${location.page}`
  }
  return [
    location.kind,
    location.projectId,
    location.worktreeId ?? '',
    location.sessionId ?? '',
    location.panel ?? ''
  ].join(':')
}

function applyWorkbenchLocation(
  location: WorkbenchLocation,
  projectWorktrees: Worktree[]
): boolean {
  if (location.kind === 'workbench') {
    return true
  }
  const state = useAppStore.getState()
  if (location.kind === 'page') {
    switch (location.page) {
      case 'activity':
        state.openHomePage()
        return true
      case 'mobile':
        state.openMobilePage()
        return true
      case 'search':
        openCommandPalette()
        return true
      case 'settings':
        state.openSettingsPage()
        return true
      case 'skills':
        state.openSkillsPage()
        return true
      case 'automations':
        return true
    }
  }

  const requestedWorktree = location.worktreeId
    ? projectWorktrees.find((worktree) => worktree.id === location.worktreeId)
    : undefined
  if (location.worktreeId && !requestedWorktree) {
    return false
  }
  const currentWorktree = projectWorktrees.find(
    (worktree) => worktree.id === state.activeWorktreeId
  )
  const worktree =
    requestedWorktree ??
    currentWorktree ??
    projectWorktrees.find((candidate) => candidate.isMainWorktree) ??
    projectWorktrees[0]
  if (!worktree || !activateAndRevealWorktree(worktree.id, { revealInSidebar: false })) {
    return false
  }
  if (location.panel) {
    showWorkspaceSidebar({ view: location.panel, worktreeId: worktree.id })
  }
  if (!location.sessionId) {
    return true
  }
  const refreshed = useAppStore.getState()
  const sessionTab = (refreshed.unifiedTabsByWorktree[worktree.id] ?? []).find(
    (tab) => tab.contentType === 'terminal' && tab.entityId === location.sessionId
  )
  if (!sessionTab || sessionTab.contentType !== 'terminal') {
    return false
  }
  refreshed.focusGroup(worktree.id, sessionTab.groupId)
  refreshed.activateTab(sessionTab.id)
  refreshed.setActiveTab(sessionTab.entityId)
  refreshed.setActiveTabType('terminal')
  return true
}

import type { WorkspacePanelTabContentType } from '@agentstart/protocol/workspace/tabs'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { useEffect, useRef } from 'react'

import { useProjectCatalog } from '../../project-catalog/provider'
import { projectCatalogRepoKey } from '../../project-catalog/query'
import type { WorkbenchLocation } from '../../runtime/workbench-location'
import { useAppStore } from '../../store/state'
import { showWorkspacePanel } from '../../workspace-panel/show-workspace-panel'
import { activateAndRevealWorktree } from '../../worktree/activation'
import type { ExtensionPage } from '../navigation'
import { openWorkbenchDestination } from './page-commands'

export type WorkbenchPageIntent = Exclude<ExtensionPage, 'search'>

export type WorkbenchRouteSearch = {
  panel?: WorkspacePanelTabContentType
  project?: string
  session?: string
  view?: WorkbenchPageIntent
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
  const projectId = search.project
  if (!projectId) {
    return { kind: 'workbench' }
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
  return {
    project: location.projectId,
    ...(location.panel ? { panel: location.panel } : {}),
    ...(location.sessionId ? { session: location.sessionId } : {}),
    ...(location.worktreeId ? { worktree: location.worktreeId } : {})
  }
}

export function workbenchPageIntentFromSearch(
  search: WorkbenchRouteSearch
): WorkbenchPageIntent | null {
  return search.view ?? null
}

function parseSearchValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseWorkbenchPage(value: unknown): WorkbenchPageIntent | null {
  switch (value) {
    case 'activity':
    case 'mobile':
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
  initialPage,
  location
}: {
  initialPage: WorkbenchPageIntent | null
  location: WorkbenchLocation
}): null {
  const persistedUIReady = useAppStore((state) => state.persistedUIReady)
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
  const appliedPageIntentRef = useRef(false)
  useEffect(() => {
    if (!persistedUIReady || !workspaceSessionReady) {
      return
    }
    if (initialPage && !appliedPageIntentRef.current) {
      openWorkbenchDestination(initialPage)
      appliedPageIntentRef.current = true
      consumePageIntent()
    }
    if (appliedLocationKeyRef.current === locationKey) {
      return
    }
    if (applyWorkbenchLocation(location, worktrees)) {
      appliedLocationKeyRef.current = locationKey
    }
  }, [
    location,
    locationKey,
    initialPage,
    persistedUIReady,
    unifiedTabsByWorktree,
    workspaceSessionReady,
    worktrees
  ])
  return null
}

function workbenchLocationKey(location: WorkbenchLocation): string {
  if (location.kind === 'workbench') {
    return location.kind
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
  const requestedWorktree = location.worktreeId
    ? projectWorktrees.find((worktree) => worktree.id === location.worktreeId)
    : undefined
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
    showWorkspacePanel({ view: location.panel, worktreeId: worktree.id })
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

function consumePageIntent(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('view')) {
    return
  }
  url.searchParams.delete('view')
  // Why: the page is now owned by the unified tab queue. Replace only the
  // consumed intent so launcher/new-tab identity markers and browser history survive.
  window.history.replaceState(window.history.state, '', url)
}

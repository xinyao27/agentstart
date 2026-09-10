export type SidebarGlobalPage = 'activity' | 'browser' | 'mobile' | 'search' | 'settings' | 'skills'

export type SidebarWorkspaceTarget = {
  dedicated?: boolean
  projectId: string
  sessionId?: string
  worktreeId?: string
}

export type SidebarHostNavigation = {
  openPage: (page: SidebarGlobalPage) => void
  openWorkspace: (target: SidebarWorkspaceTarget) => void
  prefetchWorkspace?: (target: SidebarWorkspaceTarget) => void
  runtimeLabel?: string
}

let hostNavigation: SidebarHostNavigation | null = null

export function configureSidebarHostNavigation(navigation: SidebarHostNavigation | null): void {
  hostNavigation = navigation
}

export function openSidebarPage(page: SidebarGlobalPage): boolean {
  if (!hostNavigation) {
    return false
  }
  hostNavigation.openPage(page)
  return true
}

export function openSidebarWorkspace(target: SidebarWorkspaceTarget): boolean {
  if (!hostNavigation) {
    return false
  }
  hostNavigation.openWorkspace(target)
  return true
}

export function prefetchSidebarWorkspace(target: SidebarWorkspaceTarget): boolean {
  if (!hostNavigation?.prefetchWorkspace) {
    return false
  }
  hostNavigation.prefetchWorkspace(target)
  return true
}

export function getSidebarRuntimeLabel(): string | null {
  return hostNavigation?.runtimeLabel ?? null
}

export function hasSidebarHostNavigation(): boolean {
  return hostNavigation !== null
}

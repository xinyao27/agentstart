export type SidebarGlobalPage = 'activity' | 'mobile' | 'search' | 'settings' | 'skills'

export type SidebarShellModal =
  | 'add-repo'
  | 'delete-worktree'
  | 'new-workspace-composer'
  | 'setup-guide'

/** Modal data a handoff can carry: it has to survive message passing and storage. */
export type SidebarShellModalData = Record<string, boolean | number | readonly string[] | string>

export type SidebarWorkspaceTarget = {
  openInNewTab?: boolean
  projectId: string
  sessionId?: string
  worktreeId?: string
}

export type SidebarHostNavigation = {
  openPage: (page: SidebarGlobalPage) => void
  // Why: shell modals are mounted by the workbench. The browser side panel
  // cannot render them, so it supplies a delegate that hands the modal to a
  // workbench tab; hosts that mount their own modals leave this unset.
  openShellModal?: (modal: SidebarShellModal, data?: SidebarShellModalData) => void
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

// Why: returns false when the host mounts shell modals itself, so the caller
// opens the modal in its own document instead of losing the click.
export function openSidebarShellModal(
  modal: SidebarShellModal,
  data?: SidebarShellModalData
): boolean {
  if (!hostNavigation?.openShellModal) {
    return false
  }
  hostNavigation.openShellModal(modal, data)
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

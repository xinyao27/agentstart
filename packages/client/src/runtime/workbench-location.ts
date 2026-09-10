import type { WorkspacePanelTabContentType } from '@agentstart/protocol/workspace/tabs'

export type WorkbenchPage = 'activity' | 'browser' | 'mobile' | 'search' | 'settings' | 'skills'

export type WorkbenchLocation =
  | { kind: 'workbench' }
  | { kind: 'page'; page: WorkbenchPage }
  | {
      kind: 'project'
      panel?: WorkspacePanelTabContentType
      projectId: string
      sessionId?: string
      worktreeId?: string
    }

let workbenchLocation: WorkbenchLocation = { kind: 'workbench' }
let locationBeforeSettings: WorkbenchLocation | null = null
let workbenchNavigate: ((location: WorkbenchLocation) => void) | null = null

export function configureWorkbenchLocation(location: WorkbenchLocation): void {
  if (isSettingsLocation(location) && !isSettingsLocation(workbenchLocation)) {
    locationBeforeSettings = workbenchLocation
  }
  workbenchLocation = location
}

export function configureWorkbenchNavigation(
  navigate: ((location: WorkbenchLocation) => void) | null
): void {
  workbenchNavigate = navigate
}

export function getWorkbenchLocation(): WorkbenchLocation {
  return workbenchLocation
}

export function navigateWorkbench(location: WorkbenchLocation): boolean {
  if (!workbenchNavigate || isSameWorkbenchLocation(location, workbenchLocation)) {
    return false
  }
  workbenchNavigate(location)
  return true
}

export function navigateBackFromWorkbenchSettings(): boolean {
  if (!isSettingsLocation(workbenchLocation)) {
    return false
  }
  return navigateWorkbench(locationBeforeSettings ?? { kind: 'workbench' })
}

function isSettingsLocation(location: WorkbenchLocation): boolean {
  return location.kind === 'page' && (location.page === 'settings' || location.page === 'browser')
}

function isSameWorkbenchLocation(left: WorkbenchLocation, right: WorkbenchLocation): boolean {
  if (left.kind !== right.kind) {
    return false
  }
  if (left.kind === 'workbench' || right.kind === 'workbench') {
    return true
  }
  if (left.kind === 'page' || right.kind === 'page') {
    return left.kind === 'page' && right.kind === 'page' && left.page === right.page
  }
  return (
    left.projectId === right.projectId &&
    left.worktreeId === right.worktreeId &&
    left.sessionId === right.sessionId &&
    left.panel === right.panel
  )
}

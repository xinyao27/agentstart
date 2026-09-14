import type { WorkspacePanelTabContentType } from '@agentstart/protocol/workspace/tabs'

export type WorkbenchLocation =
  | { kind: 'workbench' }
  | {
      kind: 'project'
      panel?: WorkspacePanelTabContentType
      projectId: string
      sessionId?: string
      worktreeId?: string
    }

let workbenchLocation: WorkbenchLocation = { kind: 'workbench' }
let workbenchNavigate: ((location: WorkbenchLocation) => void) | null = null

export function configureWorkbenchLocation(location: WorkbenchLocation): void {
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

function isSameWorkbenchLocation(left: WorkbenchLocation, right: WorkbenchLocation): boolean {
  if (left.kind !== right.kind) {
    return false
  }
  if (left.kind === 'workbench' || right.kind === 'workbench') {
    return left.kind === 'workbench' && right.kind === 'workbench'
  }
  return (
    left.projectId === right.projectId &&
    left.worktreeId === right.worktreeId &&
    left.sessionId === right.sessionId &&
    left.panel === right.panel
  )
}

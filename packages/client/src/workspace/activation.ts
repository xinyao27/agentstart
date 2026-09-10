import { folderWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import { toast } from 'sonner'

import type { PendingSidebarWorktreeReveal } from '../application-shell/state/slice'
import { readProjectCatalogRuntimeState } from '../project-catalog/runtime-state'
import {
  folderWorkspaceActivationBlocked,
  getFolderWorkspacePathStatusDescription,
  getFolderWorkspacePathStatusTitle
} from '../sidebar/folder-workspace-path-status'
import { useAppStore } from '../store/state'
import { resumeSleepingAgentSessionsForWorktree } from '../terminal-workspace/resume-sleeping-agent-session'
import type { ActivateAndRevealResult, WorktreeStartupPayload } from '../worktree/activation-types'
import { ensureWorktreeHasInitialTerminal } from '../worktree/initial-terminal'
import { getRuntimeEnvironmentIdForWorktree } from '../worktree/runtime-owner'

export function activateAndRevealFolderWorkspace(
  folderWorkspaceId: string,
  options?: {
    sidebarRevealBehavior?: PendingSidebarWorktreeReveal['behavior']
    startup?: WorktreeStartupPayload
    runtimeEnvironmentId?: string | null
  }
): ActivateAndRevealResult | false {
  const state = useAppStore.getState()
  const projectRuntimeState = readProjectCatalogRuntimeState()
  const folderWorkspace = projectRuntimeState.folderWorkspaces.find(
    (workspace) => workspace.id === folderWorkspaceId
  )
  if (!folderWorkspace) {
    return false
  }
  const workspaceKey = folderWorkspaceKey(folderWorkspaceId)
  const runtimeEnvironmentId =
    options && 'runtimeEnvironmentId' in options
      ? (options.runtimeEnvironmentId ?? null)
      : getRuntimeEnvironmentIdForWorktree(projectRuntimeState, workspaceKey)
  const pathStatus = state.getFreshFolderWorkspacePathStatus(
    { scope: 'folder-workspace', folderWorkspaceId },
    { runtimeEnvironmentId }
  )
  if (folderWorkspaceActivationBlocked(pathStatus)) {
    toast.error(getFolderWorkspacePathStatusTitle(pathStatus) ?? 'Cannot open folder workspace', {
      description: getFolderWorkspacePathStatusDescription(pathStatus) ?? folderWorkspace.folderPath
    })
    return false
  }
  if (state.activeView !== 'terminal') {
    state.setActiveView('terminal')
  }
  state.setActiveFolderWorkspace(folderWorkspaceId)
  state.markWorktreeVisited(workspaceKey)
  if (!state.isNavigatingHistory) {
    state.recordWorktreeVisit(workspaceKey)
  }
  resumeSleepingAgentSessionsForWorktree(workspaceKey)
  const primaryTabId = ensureWorktreeHasInitialTerminal(
    useAppStore.getState(),
    workspaceKey,
    options?.startup
  )
  const revealOptions = options?.sidebarRevealBehavior
    ? { behavior: options.sidebarRevealBehavior }
    : undefined
  state.revealWorktreeInSidebar(workspaceKey, revealOptions)
  return { primaryTabId }
}

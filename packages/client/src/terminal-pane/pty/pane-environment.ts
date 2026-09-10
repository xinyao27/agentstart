import { parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import { useAppStore } from '~renderer/store/state'

type PaneEnvironmentOptions = {
  paneKey: string
  tabId: string
  worktreeId: string
  launchToken: string | null
  startupEnv?: Record<string, string>
}

export function createPaneEnvironment(options: PaneEnvironmentOptions): Record<string, string> {
  const state = useAppStore.getState()
  const parsedWorkspaceKey = parseWorkspaceKey(options.worktreeId)
  const folderWorkspace =
    parsedWorkspaceKey?.type === 'folder'
      ? state.folderWorkspaces.find(
          (workspace) => workspace.id === parsedWorkspaceKey.folderWorkspaceId
        )
      : null
  const workspaceEnv: Record<string, string> = { AGENTSTART_WORKSPACE_ID: options.worktreeId }
  if (folderWorkspace) {
    workspaceEnv.AGENTSTART_PROJECT_GROUP_ID = folderWorkspace.projectGroupId
    workspaceEnv.AGENTSTART_WORKSPACE_ROOT = folderWorkspace.folderPath
  }
  return {
    ...options.startupEnv,
    ...workspaceEnv,
    AGENTSTART_PANE_KEY: options.paneKey,
    AGENTSTART_TAB_ID: options.tabId,
    AGENTSTART_WORKTREE_ID: options.worktreeId,
    ...(options.launchToken ? { AGENTSTART_AGENT_LAUNCH_TOKEN: options.launchToken } : {})
  }
}

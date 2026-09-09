import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
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
  const workspaceEnv: Record<string, string> = { YIRU_WORKSPACE_ID: options.worktreeId }
  if (folderWorkspace) {
    workspaceEnv.YIRU_PROJECT_GROUP_ID = folderWorkspace.projectGroupId
    workspaceEnv.YIRU_WORKSPACE_ROOT = folderWorkspace.folderPath
  }
  return {
    ...options.startupEnv,
    ...workspaceEnv,
    YIRU_PANE_KEY: options.paneKey,
    YIRU_TAB_ID: options.tabId,
    YIRU_WORKTREE_ID: options.worktreeId,
    ...(options.launchToken ? { YIRU_AGENT_LAUNCH_TOKEN: options.launchToken } : {})
  }
}

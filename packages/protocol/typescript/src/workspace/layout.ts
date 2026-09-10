export type AgentStartWorkspaceLayout = {
  path: string
  nestWorkspaces: boolean
}

export type WorkspaceLayoutSettings = {
  workspaceDir: string
  nestWorkspaces: boolean
  workspaceDirHistory?: AgentStartWorkspaceLayout[]
}

export type YiruWorkspaceLayout = {
  path: string
  nestWorkspaces: boolean
}

export type WorkspaceLayoutSettings = {
  workspaceDir: string
  nestWorkspaces: boolean
  workspaceDirHistory?: YiruWorkspaceLayout[]
}

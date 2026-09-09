import { shellFilesClient } from './file/shell-files'
import { repoHostClient } from './repo-host-client'
import { worktreeHostClient } from './worktree-host-client'

type WorkspaceHostClient = {
  fileHost: typeof shellFilesClient
  repos: typeof repoHostClient
  worktrees: typeof worktreeHostClient
}

// Why: Workspace features use the same typed host clients across local and paired runtimes.
export const workspaceHostClient: WorkspaceHostClient = {
  fileHost: shellFilesClient,
  repos: repoHostClient,
  worktrees: worktreeHostClient
}

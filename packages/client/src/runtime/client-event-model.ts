import type {
  WorktreeDefaultTabsLaunch,
  WorktreeSetupLaunch
} from '@agentstart/protocol/worktree/create-result'
import type { WorktreeHeadIdentity } from '@agentstart/protocol/worktree/model'
import type { WorktreeStartupLaunch } from '~renderer/worktree/create-model'

export type RuntimeClientEvent =
  | { type: 'reposChanged' }
  | {
      type: 'worktreesChanged'
      repoId: string
      renamed?: { oldWorktreeId: string; newWorktreeId: string }
    }
  | {
      type: 'activateWorktree'
      repoId: string
      worktreeId: string
      setup?: WorktreeSetupLaunch
      startup?: WorktreeStartupLaunch
      defaultTabs?: WorktreeDefaultTabsLaunch
    }
  | { type: 'worktreeHeadIdentitiesChanged'; repoId: string; identities: WorktreeHeadIdentity[] }

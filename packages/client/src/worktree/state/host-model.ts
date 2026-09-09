import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '@yiru/protocol/host/identity'
import type { ProjectHostSetup } from '@yiru/protocol/project/model'
import type { WorkspaceVisibleTabType } from '@yiru/protocol/workspace/tabs'
import type { WorktreeLineage } from '@yiru/protocol/worktree/lineage'
import type { Worktree } from '@yiru/protocol/worktree/model'

import { findRepoForHost } from '../../repo/state/host-identity'
import type { AppState } from '../../store/types'

export function toVisibleTabType(contentType: string): WorkspaceVisibleTabType {
  if (contentType === 'browser' || contentType === 'terminal' || contentType === 'simulator') {
    return contentType
  }
  return 'editor'
}

export type WorktreeWithLineage = Worktree & {
  parentWorktreeId?: string | null
  childWorktreeIds?: string[]
  lineage?: WorktreeLineage | null
}

// Why: runtime worktree payloads arrive from the owning host's own perspective,
// so their hostId defaults to "local" even for remote checkouts. Re-stamp them
// with the repo's execution host so per-worktree host resolution doesn't route
// remote terminals to the local machine. Local-owned repos are left untouched,
// so an explicit local worktree still overrides a runtime repo owner.
export function withRepoHostOwnership<
  T extends { hostId?: ExecutionHostId; projectId?: string; projectHostSetupId?: string }
>(worktree: T, hostId: ExecutionHostId, setup?: ProjectHostSetup): T {
  const nextHostId = hostId === LOCAL_EXECUTION_HOST_ID ? worktree.hostId : hostId
  const projectId = worktree.projectId ?? setup?.projectId
  const projectHostSetupId = worktree.projectHostSetupId ?? setup?.id
  if (
    nextHostId === worktree.hostId &&
    projectId === worktree.projectId &&
    projectHostSetupId === worktree.projectHostSetupId
  ) {
    return worktree
  }
  return {
    ...worktree,
    ...(nextHostId ? { hostId: nextHostId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(projectHostSetupId ? { projectHostSetupId } : {})
  }
}

export function repoHostId(
  state: Pick<AppState, 'repos' | 'settings'>,
  repoId: string,
  hostId?: ExecutionHostId | null
): ExecutionHostId {
  const repo = findRepoForHost(state.repos, repoId, { hostId, settings: state.settings })
  return repo ? getRepoExecutionHostId(repo) : LOCAL_EXECUTION_HOST_ID
}

export function getProjectHostSetupForRepoHost(
  state: Partial<Pick<AppState, 'projectHostSetups'>>,
  repoId: string,
  hostId: ExecutionHostId
): ProjectHostSetup | undefined {
  return state.projectHostSetups?.find(
    (setup) => setup.repoId === repoId && setup.hostId === hostId
  )
}

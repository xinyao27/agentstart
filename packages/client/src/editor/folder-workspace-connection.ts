import { isPathInsideOrEqual } from '@agentstart/protocol/host/path'
import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import { getProjectGroupSubtreeIds } from '@agentstart/protocol/project/group-tree'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'

export type FolderWorkspaceConnectionState = {
  folderWorkspaces: FolderWorkspace[]
  projectGroups: ProjectGroup[]
  repos: Repo[]
}

function getFolderScopeCandidateRepos(args: {
  folderPath: string
  projectGroupId: string
  connectionId?: string | null
  projectGroups: readonly ProjectGroup[]
  repos: readonly Repo[]
}): Repo[] {
  const groupIds = getProjectGroupSubtreeIds(args.projectGroups, args.projectGroupId)
  const groupRepos = args.repos.filter(
    (repo) => typeof repo.projectGroupId === 'string' && groupIds.has(repo.projectGroupId)
  )
  const pathRepos = args.repos.filter(
    (repo) =>
      !(typeof repo.projectGroupId === 'string' && groupIds.has(repo.projectGroupId)) &&
      isPathInsideOrEqual(args.folderPath, repo.path)
  )
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — a real scope connectionId (still settable on
  // ProjectGroup/FolderWorkspace by other clients) can never match a repo, so
  // path-matched repos only ever join the scope when it has no connection.
  if (args.connectionId) {
    return groupRepos
  }
  return [...groupRepos, ...pathRepos]
}

export function getFolderWorkspaceCandidateRepos(
  state: FolderWorkspaceConnectionState,
  folderWorkspaceId: string
): Repo[] {
  const workspace = state.folderWorkspaces.find((entry) => entry.id === folderWorkspaceId)
  if (!workspace) {
    return []
  }
  const group = state.projectGroups.find((entry) => entry.id === workspace.projectGroupId)
  return getFolderScopeCandidateRepos({
    folderPath: workspace.folderPath,
    projectGroupId: workspace.projectGroupId,
    connectionId: workspace.connectionId ?? group?.connectionId ?? null,
    projectGroups: state.projectGroups,
    repos: state.repos
  })
}

export function getFolderWorkspaceConnectionId(
  state: FolderWorkspaceConnectionState,
  folderWorkspaceId: string
): string | null | undefined {
  const workspace = state.folderWorkspaces.find((entry) => entry.id === folderWorkspaceId)
  if (!workspace) {
    return undefined
  }
  const scopeConnectionId =
    workspace.connectionId ??
    state.projectGroups.find((entry) => entry.id === workspace.projectGroupId)?.connectionId ??
    null
  if (!scopeConnectionId) {
    return null
  }
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — a scope-level connection (still settable on
  // ProjectGroup/FolderWorkspace by other clients) is only authoritative when
  // no repo is bound to this scope, since every repo is implicitly local.
  const candidateRepos = getFolderWorkspaceCandidateRepos(state, folderWorkspaceId)
  return candidateRepos.length === 0 ? scopeConnectionId : undefined
}

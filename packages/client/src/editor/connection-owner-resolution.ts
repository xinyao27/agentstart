import { isPathInsideOrEqual, normalizeRuntimePathForComparison } from '@yiru/protocol/host/path'
import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { getRepoIdFromWorktreeId } from '@yiru/protocol/worktree/identity'
import type { AppState } from '~renderer/store/types'
import { getIndexedRepoMap, getIndexedWorktreeMap } from '~renderer/worktree/repo-index'

import {
  getFolderWorkspaceCandidateRepos,
  getFolderWorkspaceConnectionId
} from './folder-workspace-connection'

type ConnectionOwnerState = Pick<
  AppState,
  'folderWorkspaces' | 'projectGroups' | 'repos' | 'worktreesByRepo'
>

export function createConnectionIdForFileSelector(
  worktreeId: string | null,
  filePath: string,
  { skip = false }: { skip?: boolean } = {}
): (state: ConnectionOwnerState) => string | null | undefined {
  let previousSlices: ConnectionOwnerState | null = null
  let previousResult: string | null | undefined
  return (state) => {
    if (skip) {
      return undefined
    }
    if (
      previousSlices?.folderWorkspaces === state.folderWorkspaces &&
      previousSlices.projectGroups === state.projectGroups &&
      previousSlices.repos === state.repos &&
      previousSlices.worktreesByRepo === state.worktreesByRepo
    ) {
      return previousResult
    }
    previousSlices = {
      folderWorkspaces: state.folderWorkspaces,
      projectGroups: state.projectGroups,
      repos: state.repos,
      worktreesByRepo: state.worktreesByRepo
    }
    previousResult = getConnectionIdForFileFromState(state, worktreeId, filePath)
    return previousResult
  }
}

export function getConnectionIdFromState(
  state: ConnectionOwnerState,
  worktreeId: string | null
): string | null | undefined {
  if (!worktreeId) {
    return null
  }
  const parsedWorkspaceKey = parseWorkspaceKey(worktreeId)
  if (parsedWorkspaceKey?.type === 'folder') {
    return getFolderWorkspaceConnectionId(state, parsedWorkspaceKey.folderWorkspaceId)
  }
  // Why: owner resolution runs from retained Zustand selectors, so unrelated
  // store writes must not flatten every worktree or scan every repository.
  const worktree = getIndexedWorktreeMap(state.worktreesByRepo).get(worktreeId)
  const repoId = worktree?.repoId ?? getRepoIdFromWorktreeId(worktreeId)
  const repo = getIndexedRepoMap(state.repos).get(repoId)
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — so a direct repo/worktree owner is never remote; only the
  // folder-workspace branch above can still resolve a live connection id.
  return repo ? null : undefined
}

export function getConnectionIdForFileFromState(
  state: ConnectionOwnerState,
  worktreeId: string | null,
  filePath: string
): string | null | undefined {
  const connectionId = getConnectionIdFromState(state, worktreeId)
  if (connectionId !== undefined || !worktreeId) {
    return connectionId
  }
  const parsedWorkspaceKey = parseWorkspaceKey(worktreeId)
  if (parsedWorkspaceKey?.type !== 'folder') {
    return undefined
  }
  const candidateRepos = getFolderWorkspaceCandidateRepos(
    state,
    parsedWorkspaceKey.folderWorkspaceId
  )
  const longestMatchingPathLength = candidateRepos
    .filter((repo) => isPathInsideOrEqual(repo.path, filePath))
    .reduce(
      (longest, repo) => Math.max(longest, normalizeRuntimePathForComparison(repo.path).length),
      0
    )
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — every matching repo already resolves to a local (null)
  // connection, so the only remaining question is whether one matched at all.
  return longestMatchingPathLength ? null : undefined
}

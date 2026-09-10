import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import { parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionIdFromState } from '~renderer/runtime/connection-context'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import {
  getExplicitRuntimeEnvironmentIdForWorktree,
  getSettingsForWorktreeRuntimeOwner
} from '~renderer/worktree/runtime-owner'
import { getRepoIdFromWorktreeId } from '~renderer/worktree/state/types'

import type { FileExplorerOperationOwner } from './types'

export type FileExplorerOperationRoute = {
  settings: { activeRuntimeEnvironmentId: string | null }
  connectionId?: string
}

type FileExplorerOwnerState = Pick<
  AppState,
  | 'settings'
  | 'repos'
  | 'worktreesByRepo'
  | 'detectedWorktreesByRepo'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'restoredRuntimeHostIdByWorkspaceSessionKey'
>

export function getFileExplorerOperationOwnerFromState(
  state: FileExplorerOwnerState,
  worktreeId: string | null | undefined
): FileExplorerOperationOwner {
  const parsedWorkspace = worktreeId ? parseWorkspaceKey(worktreeId) : null
  if (worktreeId && parsedWorkspace?.type !== 'folder') {
    const exactHostIds = getExactWorktreeHostIds(state, worktreeId)
    if (exactHostIds.size > 1) {
      return { kind: 'unresolved' }
    }
    const exactHostId = exactHostIds.values().next().value
    if (exactHostId) {
      return operationOwnerFromHostId(exactHostId)
    }

    const repoId = getRepoIdFromWorktreeId(worktreeId)
    const repoHostIds = new Set(
      state.repos.filter((repo) => repo.id === repoId).map(getRepoExecutionHostId)
    )
    if (repoHostIds.size > 1) {
      return { kind: 'unresolved' }
    }
  }

  const connectionId = getConnectionIdFromState(state, worktreeId ?? null)
  const explicitRuntimeEnvironmentId = getExplicitRuntimeEnvironmentIdForWorktree(state, worktreeId)
  // Why: global runtime focus is not ownership evidence while local metadata
  // is unresolved; destructive actions must wait for explicit provenance.
  if (connectionId === undefined && explicitRuntimeEnvironmentId === null) {
    return { kind: 'unresolved' }
  }
  const settings = getSettingsForWorktreeRuntimeOwner(state, worktreeId)
  const runtimeEnvironmentId = settings.activeRuntimeEnvironmentId?.trim()
  if (runtimeEnvironmentId) {
    return { kind: 'runtime', environmentId: runtimeEnvironmentId }
  }
  if (connectionId === undefined) {
    return { kind: 'unresolved' }
  }
  return { kind: 'local' }
}

export function getFileExplorerOperationOwner(
  worktreeId: string | null | undefined
): FileExplorerOperationOwner {
  return getFileExplorerOperationOwnerFromState(useAppStore.getState(), worktreeId)
}

export function getFileExplorerOperationRoute(
  owner: FileExplorerOperationOwner
): FileExplorerOperationRoute | null {
  switch (owner.kind) {
    case 'local':
      return { settings: { activeRuntimeEnvironmentId: null } }
    case 'runtime':
      return { settings: { activeRuntimeEnvironmentId: owner.environmentId } }
    case 'unresolved':
      return null
  }
}

export function getFileExplorerOwnerUnresolvedMessage(): string {
  return translate(
    'auto.components.right.sidebar.fileExplorerOperationOwner.unresolved',
    "Couldn't determine which host owns this workspace. Check the connection and try again."
  )
}

function getExactWorktreeHostIds(
  state: Pick<AppState, 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  worktreeId: string
): Set<ExecutionHostId> {
  const hostIds = new Set<ExecutionHostId>()
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    for (const worktree of worktrees) {
      if (worktree.id === worktreeId && worktree.hostId) {
        hostIds.add(worktree.hostId)
      }
    }
  }
  for (const result of Object.values(state.detectedWorktreesByRepo)) {
    for (const worktree of result.worktrees) {
      if (worktree.id === worktreeId && worktree.hostId) {
        hostIds.add(worktree.hostId)
      }
    }
  }
  return hostIds
}

function operationOwnerFromHostId(hostId: ExecutionHostId): FileExplorerOperationOwner {
  const parsed = parseExecutionHostId(hostId)
  switch (parsed?.kind) {
    case 'local':
      return { kind: 'local' }
    case 'runtime':
      return { kind: 'runtime', environmentId: parsed.environmentId }
    case 'ssh':
    case 'wsl':
      // Why: SSH and WSL are adapters inside the connected daemon, so the operation stays on
      // this runtime connection; the worktree identity carries the exact execution host.
      return { kind: 'local' }
    case undefined:
      return { kind: 'unresolved' }
  }
}

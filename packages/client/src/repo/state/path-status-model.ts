import { FOLDER_WORKSPACE_PROTOCOL_CAPABILITY } from '@yiru/protocol'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/protocol/host/identity'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import {
  FOLDER_WORKSPACE_PATH_STATUS_TTL_MS,
  type FolderWorkspacePathStatus,
  type FolderWorkspacePathStatusRequest
} from '@yiru/protocol/workspace/folder-path'
import { translate } from '~renderer/i18n/i18n'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { getRuntimeFolderPathStatus } from '~renderer/runtime/folder-workspace-target'
import {
  assertRuntimeEnvironmentCapability,
  getActiveRuntimeTarget
} from '~renderer/runtime/rpc-client'

import type { AppState } from '../../store/types'
import { findRepoForHost } from './host-identity'
import type { FolderWorkspacePathStatusCacheEntry } from './update-model'

export function settingsForRepoOwner(
  state: Pick<AppState, 'repos' | 'settings'>,
  repoId: string,
  hostId?: ExecutionHostId
) {
  const repo = findRepoForHost(state.repos, repoId, { settings: state.settings, hostId })
  if (!repo) {
    return state.settings
  }
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — only executionHostId can still make a repo non-local.
  if (!repo.executionHostId) {
    return state.settings
  }
  const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (parsed?.kind === 'runtime') {
    return state.settings
      ? { ...state.settings, activeRuntimeEnvironmentId: parsed.environmentId }
      : ({ activeRuntimeEnvironmentId: parsed.environmentId } as AppState['settings'])
  }
  if (parsed?.kind === 'local' && state.settings?.activeRuntimeEnvironmentId) {
    return { ...state.settings, activeRuntimeEnvironmentId: null }
  }
  return state.settings
}

export function getFolderWorkspacePathStatusScopeKey(
  request: FolderWorkspacePathStatusRequest
): string {
  if (request.scope === 'project-group') {
    return `project-group:${request.projectGroupId}`
  }
  if (request.scope === 'path') {
    return `path:${request.path}`
  }
  return `folder-workspace:${request.folderWorkspaceId}`
}

export function getRuntimeTargetCachePrefix(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): string {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
}

export type FolderWorkspacePathStatusRouteOptions = { runtimeEnvironmentId?: string | null }
export type AddRepoPathRouteOptions = { runtimeEnvironmentId?: string | null }

export function getFolderWorkspacePathStatusRouteSettings(
  options: FolderWorkspacePathStatusRouteOptions | undefined,
  fallbackSettings: GlobalSettings | null
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined {
  return options && 'runtimeEnvironmentId' in options
    ? { activeRuntimeEnvironmentId: options.runtimeEnvironmentId ?? null }
    : fallbackSettings
}

export function getAddRepoPathRouteSettings(
  options: AddRepoPathRouteOptions | undefined,
  fallbackSettings: GlobalSettings | null
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined {
  return options && 'runtimeEnvironmentId' in options
    ? { activeRuntimeEnvironmentId: options.runtimeEnvironmentId ?? null }
    : fallbackSettings
}

export function getRuntimeEnvironmentDisplayName(
  state: { runtimeEnvironments: readonly PublicKnownRuntimeEnvironment[] },
  environmentId: string
): string {
  const environment = state.runtimeEnvironments.find((entry) => entry.id === environmentId)
  return environment?.name || environmentId
}

export async function fetchRuntimeAddProjectPathStatus(args: {
  target: Extract<ReturnType<typeof getActiveRuntimeTarget>, { kind: 'environment' }>
  path: string
}): Promise<FolderWorkspacePathStatus | null> {
  await assertRuntimeEnvironmentCapability(
    args.target.environmentId,
    FOLDER_WORKSPACE_PROTOCOL_CAPABILITY,
    translate(
      'auto.store.slices.repos.2975400634',
      'Update Yiru on this runtime host to open non-Git folders.'
    ),
    15_000
  )
  try {
    const { status } = await getRuntimeFolderPathStatus(args.target, {
      scope: 'path',
      path: args.path
    })
    return status
  } catch (err) {
    console.warn('Failed to check runtime folder path status:', err)
    return null
  }
}

export function getFolderWorkspaceStatusRequestSnapshot(
  state: Pick<AppState, 'projectGroups' | 'folderWorkspaces'>,
  request: FolderWorkspacePathStatusRequest
): string | null {
  if (request.scope === 'path') {
    return request.path
  }

  if (request.scope === 'project-group') {
    const group = state.projectGroups.find((entry) => entry.id === request.projectGroupId)
    return group?.parentPath
      ? [group.parentPath, group.id, group.executionHostId ?? ''].join('\0')
      : null
  }

  const workspace = state.folderWorkspaces.find((entry) => entry.id === request.folderWorkspaceId)
  if (!workspace) {
    return null
  }
  const group = state.projectGroups.find((entry) => entry.id === workspace.projectGroupId)
  return [workspace.folderPath, workspace.projectGroupId, group?.executionHostId ?? ''].join('\0')
}

export function getFreshFolderWorkspacePathStatusFromCache(args: {
  entry: FolderWorkspacePathStatusCacheEntry | undefined
  requestSnapshot: string | null
}): FolderWorkspacePathStatus | null {
  const { entry, requestSnapshot } = args
  if (!entry || requestSnapshot === null || entry.requestSnapshot !== requestSnapshot) {
    return null
  }
  return Date.now() - entry.checkedAt < FOLDER_WORKSPACE_PATH_STATUS_TTL_MS ? entry.status : null
}

export function getFolderWorkspacePathStatusRequestSnapshotForRead(
  state: AppState,
  request: FolderWorkspacePathStatusRequest
): string | null {
  return getFolderWorkspaceStatusRequestSnapshot(state, request)
}

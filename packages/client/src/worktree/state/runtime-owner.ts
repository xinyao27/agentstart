import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/protocol/host/identity'

import { findRepoForHost } from '../../repo/state/host-identity'
import type { AppState } from '../../store/types'
import { findWorktreeById, getRepoIdFromWorktreeId } from './types'

export function settingsForRepoOwner(
  state: Pick<AppState, 'repos' | 'settings'>,
  repoId: string,
  hostId?: ExecutionHostId | null
) {
  const repo = findRepoForHost(state.repos, repoId, { hostId, settings: state.settings })
  return repo ? settingsForKnownRepoOwner(state.settings, repo) : state.settings
}

export function settingsForKnownRepoOwner(
  settings: AppState['settings'],
  repo: { connectionId?: string | null; executionHostId?: ExecutionHostId | null }
) {
  if (!repo.executionHostId) {
    return settings
  }
  const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (parsed?.kind === 'runtime') {
    return settings
      ? { ...settings, activeRuntimeEnvironmentId: parsed.environmentId }
      : ({ activeRuntimeEnvironmentId: parsed.environmentId } as AppState['settings'])
  }
  if (parsed?.kind === 'local' && settings?.activeRuntimeEnvironmentId) {
    return { ...settings, activeRuntimeEnvironmentId: null }
  }
  return settings
}

export function settingsForExecutionHostOwner(
  settings: AppState['settings'],
  executionHostId: string | null | undefined
) {
  const parsed = parseExecutionHostId(executionHostId)
  if (parsed?.kind === 'runtime') {
    return settings
      ? { ...settings, activeRuntimeEnvironmentId: parsed.environmentId }
      : ({ activeRuntimeEnvironmentId: parsed.environmentId } as AppState['settings'])
  }
  if (parsed?.kind === 'local') {
    return settings
      ? { ...settings, activeRuntimeEnvironmentId: null }
      : ({ activeRuntimeEnvironmentId: null } as AppState['settings'])
  }
  return settings
}

export function settingsForWorktreeOwner(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  worktreeId: string
) {
  const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
  if (worktree?.hostId) {
    return settingsForExecutionHostOwner(state.settings, worktree.hostId)
  }
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const detected = state.detectedWorktreesByRepo[repoId]?.worktrees.find(
    (entry) => entry.id === worktreeId
  )
  return detected?.hostId
    ? settingsForExecutionHostOwner(state.settings, detected.hostId)
    : settingsForRepoOwner(state, repoId)
}

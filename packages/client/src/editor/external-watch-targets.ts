import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import type { AppState } from '~renderer/store/state'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'
import { findWorktreeById } from '~renderer/worktree/state/types'

import {
  openFileRuntimeOwner,
  type WatchedTarget,
  type WatchedTargetsSnapshot
} from './external-watch-types'

export type EditorExternalWatchTargetState = Pick<
  AppState,
  | 'openFiles'
  | 'worktreesByRepo'
  | 'repos'
  | 'activeWorktreeId'
  | 'settings'
  | 'rightSidebarOpen'
  | 'rightSidebarTab'
  | 'rightSidebarExplorerView'
  | 'gitStatusHugeByWorktree'
>

let cachedOpenFiles: AppState['openFiles'] | null = null
let cachedWorktreesByRepo: AppState['worktreesByRepo'] | null = null
let cachedRepos: AppState['repos'] | null = null
let cachedActiveWorktreeId: string | null = null
let cachedRuntimeEnvironmentId: string | undefined
let cachedRightSidebarOpen: boolean | null = null
let cachedRightSidebarTab: AppState['rightSidebarTab'] | null = null
let cachedRightSidebarExplorerView: AppState['rightSidebarExplorerView'] | null = null
let cachedGitStatusHugeByWorktree: AppState['gitStatusHugeByWorktree'] | null = null
let cachedSnapshot: WatchedTargetsSnapshot = { targets: [], targetsKey: '' }

export function getWatchedTargetKey(target: WatchedTarget): string {
  // Why: an SSH placeholder watch must be replaced when its connection owner hydrates.
  return `${target.worktreeId}::${target.worktreePath}::${target.connectionId ?? 'local'}::${target.runtimeEnvironmentId ?? 'client'}`
}

export function getEditorExternalWatchTargets(
  state: EditorExternalWatchTargetState
): WatchedTargetsSnapshot {
  const runtimeEnvironmentId = state.settings?.activeRuntimeEnvironmentId?.trim() || undefined
  if (isCachedState(state, runtimeEnvironmentId)) {
    return cachedSnapshot
  }

  const ownersByWorktreeId = collectOpenFileOwners(state)
  addSidebarWatchOwner(state, ownersByWorktreeId)
  const targets: WatchedTarget[] = []
  const targetKeys: string[] = []
  for (const worktreeId of Array.from(ownersByWorktreeId.keys()).sort()) {
    const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
    if (!worktree) {
      continue
    }
    const owners = Array.from(ownersByWorktreeId.get(worktreeId) ?? []).sort((a, b) =>
      (a ?? '').localeCompare(b ?? '')
    )
    for (const owner of owners) {
      const target: WatchedTarget = {
        worktreeId,
        worktreePath: worktree.path,
        connectionId: undefined,
        runtimeEnvironmentId: owner
      }
      targets.push(target)
      targetKeys.push(getWatchedTargetKey(target))
    }
  }

  const targetsKey = targetKeys.join('|')
  updateCache(state, runtimeEnvironmentId)
  if (targetsKey !== cachedSnapshot.targetsKey) {
    cachedSnapshot = { targets, targetsKey }
  }
  return cachedSnapshot
}

function collectOpenFileOwners(
  state: EditorExternalWatchTargetState
): Map<string, Set<string | null>> {
  const ownersByWorktreeId = new Map<string, Set<string | null>>()
  for (const file of state.openFiles) {
    let owners = ownersByWorktreeId.get(file.worktreeId)
    if (!owners) {
      owners = new Set()
      ownersByWorktreeId.set(file.worktreeId, owners)
    }
    owners.add(openFileRuntimeOwner(file))
  }
  return ownersByWorktreeId
}

function addSidebarWatchOwner(
  state: EditorExternalWatchTargetState,
  ownersByWorktreeId: Map<string, Set<string | null>>
): void {
  const worktreeId = state.activeWorktreeId
  const worktree = worktreeId ? findWorktreeById(state.worktreesByRepo, worktreeId) : undefined
  const repo = worktree
    ? state.repos.find((candidate) => candidate.id === worktree.repoId)
    : undefined
  const canWatchSourceControl =
    !!worktreeId && !!repo && isGitRepoKind(repo) && !state.gitStatusHugeByWorktree[worktreeId]
  const needsWatch =
    worktreeId !== null &&
    state.rightSidebarOpen &&
    ((state.rightSidebarTab === 'explorer' && state.rightSidebarExplorerView === 'files') ||
      (state.rightSidebarTab === 'source-control' && canWatchSourceControl))
  if (!needsWatch) {
    return
  }
  let owners = ownersByWorktreeId.get(worktreeId)
  if (!owners) {
    owners = new Set()
    ownersByWorktreeId.set(worktreeId, owners)
  }
  owners.add(getRuntimeEnvironmentIdForWorktree(state, worktreeId))
}

function isCachedState(
  state: EditorExternalWatchTargetState,
  runtimeEnvironmentId: string | undefined
): boolean {
  return (
    cachedOpenFiles === state.openFiles &&
    cachedWorktreesByRepo === state.worktreesByRepo &&
    cachedRepos === state.repos &&
    cachedActiveWorktreeId === state.activeWorktreeId &&
    cachedRuntimeEnvironmentId === runtimeEnvironmentId &&
    cachedRightSidebarOpen === state.rightSidebarOpen &&
    cachedRightSidebarTab === state.rightSidebarTab &&
    cachedRightSidebarExplorerView === state.rightSidebarExplorerView &&
    cachedGitStatusHugeByWorktree === state.gitStatusHugeByWorktree
  )
}

function updateCache(
  state: EditorExternalWatchTargetState,
  runtimeEnvironmentId: string | undefined
): void {
  cachedOpenFiles = state.openFiles
  cachedWorktreesByRepo = state.worktreesByRepo
  cachedRepos = state.repos
  cachedActiveWorktreeId = state.activeWorktreeId
  cachedRuntimeEnvironmentId = runtimeEnvironmentId
  cachedRightSidebarOpen = state.rightSidebarOpen
  cachedRightSidebarTab = state.rightSidebarTab
  cachedRightSidebarExplorerView = state.rightSidebarExplorerView
  cachedGitStatusHugeByWorktree = state.gitStatusHugeByWorktree
}

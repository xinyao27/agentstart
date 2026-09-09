import {
  clearAllRemoteRuntimeWakeTerminalRespawn,
  clearRemoteRuntimeWakeTerminalRespawnForWorktree
} from '../remote-runtime-wake-terminal-respawn'
import { clearRemoteSessionReorderIntentsForWorktree } from './reorder-intent'
import type { RuntimeMobileSessionTabsResult } from './session-model'

export const WEB_SESSION_GROUP_PREFIX = 'remote-session-tabs:'

export type SessionTabsStreamEvent =
  | (RuntimeMobileSessionTabsResult & { type: 'snapshot' | 'updated' })
  | { type: 'snapshots'; snapshots: RuntimeMobileSessionTabsResult[] }
  | { type: 'end' }

type SnapshotFreshness = {
  publicationEpoch: string
  snapshotVersion: number
}

const latestSessionTabsSnapshotByWorktree = new Map<string, SnapshotFreshness>()
const lastHostTerminalTabCountByWorktree = new Map<string, number>()
export const hostSessionTabIdByLocalKey = new Map<string, string>()

import type { RemoteSessionTabsSyncState } from './tabs-state'

function sessionTabsFreshnessKey(environmentId: string, worktreeId: string): string {
  return `${environmentId}:${worktreeId}`
}

function rememberHostTerminalTabCount(
  environmentId: string,
  snapshot: RuntimeMobileSessionTabsResult
): void {
  const key = sessionTabsFreshnessKey(environmentId, snapshot.worktree)
  const terminalCount = snapshot.tabs.filter((tab) => tab.type === 'terminal').length
  lastHostTerminalTabCountByWorktree.set(key, terminalCount)
}

export function getLastKnownHostTerminalTabCount(
  environmentId: string,
  worktreeId: string
): number {
  return (
    lastHostTerminalTabCountByWorktree.get(sessionTabsFreshnessKey(environmentId, worktreeId)) ?? 0
  )
}

// Why: a post-reconnect subscription replay re-emits the current snapshot with
// an unchanged epoch/version; dropping the freshness entry lets the monotonic
// gate accept that replay as authoritative instead of freezing the mirror
// (#7718). Normal-operation ordering protection is untouched — this only runs
// for responses the connection tagged as reconnect replays.
export function acceptReplayedRemoteSessionTabsSnapshot(
  environmentId: string,
  worktreeId: string
): void {
  latestSessionTabsSnapshotByWorktree.delete(sessionTabsFreshnessKey(environmentId, worktreeId))
}

export function shouldApplyRemoteSessionTabsSnapshot(
  snapshot: RuntimeMobileSessionTabsResult,
  environmentId: string
): boolean {
  const key = sessionTabsFreshnessKey(environmentId, snapshot.worktree)
  if ((snapshot as { removed?: unknown }).removed === true) {
    // Why: removed worktrees can stop publishing snapshots, so their
    // freshness/mapping entries need explicit cleanup instead of waiting for
    // a later replacement snapshot that may never arrive.
    clearRemoteSessionTabsTrackingForWorktree(environmentId, snapshot.worktree)
    return true
  }
  rememberHostTerminalTabCount(environmentId, snapshot)
  const current = latestSessionTabsSnapshotByWorktree.get(key)
  // Why: snapshotVersion is monotonic only WITHIN one host generation; it resets
  // when the host restarts, and each restart produces a different publicationEpoch.
  // So only treat a frame as stale when it shares the current epoch and isn't
  // newer — a different epoch is a new generation (or a restart) and must apply,
  // even if its version is lower. (A cross-stream out-of-order frame with a
  // different epoch may briefly apply, but the next snapshot's higher version
  // self-heals it; rejecting on version alone would instead permanently drop a
  // post-restart snapshot, since the client's tracking survives transparent
  // transport reconnects.)
  if (
    current &&
    current.publicationEpoch === snapshot.publicationEpoch &&
    snapshot.snapshotVersion <= current.snapshotVersion
  ) {
    return false
  }
  latestSessionTabsSnapshotByWorktree.set(key, {
    publicationEpoch: snapshot.publicationEpoch,
    snapshotVersion: snapshot.snapshotVersion
  })
  return true
}

export function shouldBootstrapInitialRemoteRuntimeTerminal(args: {
  event: SessionTabsStreamEvent
  activeWorktreeId: string
  requestedInitialTerminal: boolean
  snapshotIsFresh: boolean
  localTerminalCount: number
}): boolean {
  return (
    args.snapshotIsFresh &&
    args.event.type === 'snapshot' &&
    args.event.tabs.length === 0 &&
    args.localTerminalCount === 0 &&
    !args.requestedInitialTerminal &&
    args.activeWorktreeId === args.event.worktree
  )
}

export function shouldRespawnRemoteRuntimeTerminalAfterWake(args: {
  event: SessionTabsStreamEvent
  activeWorktreeId: string
  requestedRespawnAfterWake: boolean
  snapshotIsFresh: boolean
  localTerminalCount: number
  hasLiveLocalPty: boolean
  skipWakeRespawn?: boolean
}): boolean {
  if (
    !args.snapshotIsFresh ||
    args.requestedRespawnAfterWake ||
    args.skipWakeRespawn === true ||
    args.localTerminalCount === 0 ||
    args.hasLiveLocalPty ||
    (args.event.type !== 'snapshot' && args.event.type !== 'updated')
  ) {
    return false
  }
  if (args.activeWorktreeId !== args.event.worktree) {
    return false
  }
  const hostTerminalTabCount = args.event.tabs.filter((tab) => tab.type === 'terminal').length
  return hostTerminalTabCount === 0
}

export function shouldSyncRuntimeSessionTabs(args: {
  activeWorktreeId?: string | null
  activeWorktreeRuntimeEnvironmentId?: string | null
  workspaceSessionReady: boolean
}): boolean {
  const environmentId = args.activeWorktreeRuntimeEnvironmentId?.trim()
  if (!environmentId || !args.workspaceSessionReady) {
    return false
  }
  return Boolean(args.activeWorktreeId?.trim())
}

export function shouldSyncAllRuntimeSessionTabs(args: {
  activeRuntimeEnvironmentId: string | null | undefined
  workspaceSessionReady: boolean
}): boolean {
  const environmentId = args.activeRuntimeEnvironmentId?.trim()
  return Boolean(environmentId && args.workspaceSessionReady)
}

function clearRemoteSessionTabsTrackingForWorktree(
  environmentId: string,
  worktreeId: string
): void {
  const key = sessionTabsFreshnessKey(environmentId, worktreeId)
  latestSessionTabsSnapshotByWorktree.delete(key)
  lastHostTerminalTabCountByWorktree.delete(key)
  clearRemoteRuntimeWakeTerminalRespawnForWorktree(worktreeId)
  clearRemoteSessionReorderIntentsForWorktree(worktreeId)
  const keyPrefix = `${environmentId}:${worktreeId}:`
  for (const key of hostSessionTabIdByLocalKey.keys()) {
    if (key.startsWith(keyPrefix)) {
      hostSessionTabIdByLocalKey.delete(key)
    }
  }
}

export function clearRemoteSessionTabsTrackingForEnvironment(environmentId: string): void {
  const trimmedEnvironmentId = environmentId.trim()
  if (!trimmedEnvironmentId) {
    return
  }
  const keyPrefix = `${trimmedEnvironmentId}:`
  for (const key of latestSessionTabsSnapshotByWorktree.keys()) {
    if (key.startsWith(keyPrefix)) {
      latestSessionTabsSnapshotByWorktree.delete(key)
    }
  }
  for (const key of lastHostTerminalTabCountByWorktree.keys()) {
    if (key.startsWith(keyPrefix)) {
      lastHostTerminalTabCountByWorktree.delete(key)
    }
  }
  for (const key of hostSessionTabIdByLocalKey.keys()) {
    if (key.startsWith(keyPrefix)) {
      hostSessionTabIdByLocalKey.delete(key)
    }
  }
  clearAllRemoteRuntimeWakeTerminalRespawn()
}

export function hostSessionTabMappingKey(args: {
  environmentId: string
  worktreeId: string
  tabId: string
}): string {
  return `${args.environmentId}:${args.worktreeId}:${args.tabId}`
}

export function resolveHostSessionTabIdForRemoteSessionTab(
  _state: RemoteSessionTabsSyncState,
  args: {
    environmentId: string
    worktreeId: string
    tabId: string
  }
): string | null {
  return hostSessionTabIdByLocalKey.get(hostSessionTabMappingKey(args)) ?? null
}

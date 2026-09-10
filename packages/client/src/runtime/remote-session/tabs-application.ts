import type { AppState } from '../../store/state'
import { useAppStore } from '../../store/state'
import {
  isRemoteSessionCloseIntentPending,
  reconcileRemoteSessionCloseIntents
} from './close-intent'
import { clearRemoteSessionFocusIntent, peekRemoteSessionFocusIntent } from './focus-intent'
import { buildRemoteSessionGroupReconciliation } from './group-reconciliation'
import { buildRemoteSessionResourceReconciliation } from './resource-reconciliation'
import { resolveRemoteSessionSnapshotSelection } from './selection-reconciliation'
import type { RuntimeMobileSessionTabsResult } from './session-model'
import { buildRemoteSessionSnapshotPatch } from './snapshot-patch'
import { buildRemoteSessionSurfaceMirror } from './surface-reconciliation'
import type { RemoteSessionTabsSyncState } from './tabs-state'
import { shouldApplyRemoteSessionTabsSnapshot } from './tabs-tracking'

export function applyRemoteSessionTabsSnapshot(
  state: RemoteSessionTabsSyncState,
  rawSnapshot: RuntimeMobileSessionTabsResult,
  environmentId: string,
  now = Date.now()
): RemoteSessionTabsSyncState | Partial<RemoteSessionTabsSyncState> {
  const worktreeId = rawSnapshot.worktree
  // Why: a remote close prunes the local mirror immediately, but an in-flight
  // pre-close snapshot can still list the tab and flash it back. Drop any tab
  // the client is closing until the host confirms removal; reconcile the intents
  // against the full snapshot first so confirmed (absent) closes clear.
  // Why: must match the id the close path records as the intent. The close RPC
  // resolves to the host session tab id (terminal parentTabId; otherwise tab.id)
  // — keying browser on browserPageId instead never matched, so browser closes
  // were never suppressed and reconcile cleared the intent on the still-present
  // snapshot. The host also addresses tabs by session id, not page id.
  const snapshotHostTabId = (tab: RuntimeMobileSessionTabsResult['tabs'][number]): string =>
    tab.type === 'terminal' ? tab.parentTabId : tab.id
  reconcileRemoteSessionCloseIntents(
    worktreeId,
    new Set(rawSnapshot.tabs.map((tab) => snapshotHostTabId(tab)))
  )
  const snapshot: RuntimeMobileSessionTabsResult = rawSnapshot.tabs.some((tab) =>
    isRemoteSessionCloseIntentPending(worktreeId, snapshotHostTabId(tab), now)
  )
    ? {
        ...rawSnapshot,
        tabs: rawSnapshot.tabs.filter(
          (tab) => !isRemoteSessionCloseIntentPending(worktreeId, snapshotHostTabId(tab), now)
        )
      }
    : rawSnapshot
  // Why: only follow the snapshot's active tab over the user's current focus when
  // the client itself initiated this activation (a create/activate it recorded).
  // An unsolicited server-active (e.g. an agent "thinking" echo) must not steal
  // focus — that's the #5435 contract. Intent matches by the host active tab id
  // (terminal session id, or browserPageId for browser tabs); consume it once.
  const focusIntentHostTabId = peekRemoteSessionFocusIntent(worktreeId)
  const honorSnapshotActiveFocus =
    focusIntentHostTabId !== null &&
    snapshot.activeTabId !== null &&
    (snapshot.activeTabId === focusIntentHostTabId ||
      snapshot.tabs.some(
        (tab) =>
          tab.id === snapshot.activeTabId &&
          tab.type === 'browser' &&
          tab.browserPageId === focusIntentHostTabId
      ))
  if (honorSnapshotActiveFocus) {
    clearRemoteSessionFocusIntent(worktreeId)
  }
  const surfaceMirror = buildRemoteSessionSurfaceMirror({
    state,
    snapshot,
    environmentId,
    now,
    worktreeId
  })
  const selection = resolveRemoteSessionSnapshotSelection({
    state,
    snapshot,
    environmentId,
    worktreeId,
    honorSnapshotActiveFocus,
    surfaceMirror
  })
  const groupMirror = buildRemoteSessionGroupReconciliation({
    state,
    snapshot,
    worktreeId,
    now,
    surfaceMirror,
    selection
  })
  const resources = buildRemoteSessionResourceReconciliation({
    state,
    environmentId,
    surfaceMirror
  })
  return buildRemoteSessionSnapshotPatch({
    state,
    snapshot,
    worktreeId,
    now,
    honorSnapshotActiveFocus,
    surfaceMirror,
    selection,
    groupMirror,
    resources
  })
}

function applyRemoteSessionTabsSnapshots(
  state: RemoteSessionTabsSyncState,
  snapshots: readonly RuntimeMobileSessionTabsResult[],
  environmentId: string,
  now = Date.now()
): RemoteSessionTabsSyncState | Partial<RemoteSessionTabsSyncState> {
  let nextState = state
  let mergedPatch: Partial<RemoteSessionTabsSyncState> = {}
  for (const snapshot of snapshots) {
    const patch = applyRemoteSessionTabsSnapshot(nextState, snapshot, environmentId, now)
    if (patch === nextState) {
      continue
    }
    mergedPatch = { ...mergedPatch, ...patch }
    nextState = { ...nextState, ...patch }
  }
  return Object.keys(mergedPatch).length === 0 ? state : mergedPatch
}

export function applyFreshRemoteSessionTabsSnapshot(
  state: RemoteSessionTabsSyncState,
  snapshot: RuntimeMobileSessionTabsResult,
  environmentId: string,
  now = Date.now()
): RemoteSessionTabsSyncState | Partial<RemoteSessionTabsSyncState> {
  if (!shouldApplyRemoteSessionTabsSnapshot(snapshot, environmentId)) {
    return state
  }
  return applyRemoteSessionTabsSnapshot(state, snapshot, environmentId, now)
}

export function applyFreshRemoteSessionTabsSnapshots(
  state: RemoteSessionTabsSyncState,
  snapshots: readonly RuntimeMobileSessionTabsResult[],
  environmentId: string,
  now = Date.now()
): RemoteSessionTabsSyncState | Partial<RemoteSessionTabsSyncState> {
  const freshSnapshots = snapshots.filter((snapshot) =>
    shouldApplyRemoteSessionTabsSnapshot(snapshot, environmentId)
  )
  return freshSnapshots.length === 0
    ? state
    : applyRemoteSessionTabsSnapshots(state, freshSnapshots, environmentId, now)
}

export function applyRemoteSessionTabsStorePatch(
  buildPatch: (state: AppState) => RemoteSessionTabsSyncState | Partial<RemoteSessionTabsSyncState>
): void {
  let mirroredAgentStatusChanged = false
  useAppStore.setState((state) => {
    const patch = buildPatch(state)
    mirroredAgentStatusChanged =
      patch !== state && Object.prototype.hasOwnProperty.call(patch, 'agentStatusByPaneKey')
    return patch
  })
  // Why: paired-web snapshots bypass setAgentStatus, so they must explicitly
  // arm the same stale-boundary timer as local hook events.
  if (mirroredAgentStatusChanged) {
    useAppStore.getState().scheduleAgentStatusFreshness()
  }
}

import type { StateCreator } from 'zustand'
// Why: import the store-free registry, not terminal-parked-tab-watchers —
// that module imports @/store, and a slice importing it would re-enter store
// creation before this slice finishes evaluating.

import type { AppState } from '../../store/types'
import type { TerminalSlice } from './slice-state'
export type { TerminalSlice } from './slice-state'
import { createTerminalCloseActions } from './close-actions'
import { createTerminalCreateActions } from './create-actions'
import { createTerminalHibernateActions } from './hibernate-actions'
import { createTerminalHydrationActions } from './hydration-actions'
import { createTerminalLayoutActions } from './layout-actions'
import { createTerminalOpenActions } from './open-actions'
import { createTerminalOrderActions } from './order-actions'
import { createTerminalPtyOwnershipActions } from './pty-ownership-actions'
import { createTerminalReconnectActions } from './reconnect-actions'
import { createTerminalSessionStateActions } from './session-state-actions'
import { createTerminalShutdownActions } from './shutdown-actions'
import { createTerminalStartupActions } from './startup-actions'
import { createTerminalTitleActions } from './title-actions'
import { createTerminalUnreadActions } from './unread-actions'
export { worktreeUsesRemoteConnection } from './runtime-model'

export const createTerminalSlice: StateCreator<AppState, [], [], TerminalSlice> = (set, get) => ({
  tabsByWorktree: {},
  activeTabId: null,
  activeTabIdByWorktree: {},
  ptyIdsByTabId: {},
  runtimePaneTitlesByTabId: {},
  unreadTerminalTabs: {},
  unreadTerminalPanes: {},
  unreadAgentCompletionPanes: {},
  suppressedPtyExitIds: {},
  pendingCodexPaneRestartIds: {},
  codexRestartNoticeByPtyId: {},
  expandedPaneByTabId: {},
  canExpandPaneByTabId: {},
  terminalLayoutsByTabId: {},
  pendingStartupByTabId: {},
  pendingInitialCwdByTabId: {},
  pendingSetupSplitByTabId: {},
  automaticAgentResumeClaimsByTabId: {},
  tabBarOrderByWorktree: {},
  workspaceSessionReady: false,
  restoredRuntimeHostIdByWorkspaceSessionKey: {},
  defaultTerminalTabsAppliedByWorktreeId: {},
  ...createTerminalSessionStateActions(set, get),
  hydrationSucceeded: false,
  pendingReconnectWorktreeIds: [],
  pendingReconnectTabByWorktree: {},
  pendingReconnectPtyIdByTabId: {},
  lastKnownRelayPtyIdByTabId: {},
  pendingSnapshotByPtyId: {},
  pendingColdRestoreByPtyId: {},
  deferredSshReconnectTargets: [],
  cacheTimerByKey: {},
  lastTerminalInputAtByPaneKey: {},
  recentQuickCommandIdByGroup: {},
  ...createTerminalCreateActions(set, get),

  ...createTerminalOpenActions(set, get),

  ...createTerminalCloseActions(set, get),

  ...createTerminalOrderActions(set, get),
  ...createTerminalTitleActions(set, get),
  ...createTerminalUnreadActions(set, get),
  ...createTerminalPtyOwnershipActions(set, get),
  ...createTerminalHibernateActions(set, get),

  ...createTerminalShutdownActions(set, get),

  ...createTerminalLayoutActions(set, get),
  ...createTerminalStartupActions(set, get),
  ...createTerminalHydrationActions(set, get),

  ...createTerminalReconnectActions(set, get)
})

import type { StartupCommandDelivery } from '@agentstart/protocol/agent/launch/startup-delivery'
import type {
  AgentProviderSessionMetadata,
  SleepingAgentLaunchConfig
} from '@agentstart/protocol/agent/session-resume'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { SetupSplitDirection } from '@agentstart/protocol/settings/workspace-preferences'
import type {
  TerminalLayoutSnapshot,
  WorkspaceSessionState
} from '@agentstart/protocol/workspace/session'
import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import type { AgentStartedTelemetry } from '~renderer/agent/started-telemetry'
import type { CodexRestartNotice } from '~renderer/terminal/codex-restart-notice'
import type { WorkspaceSessionHydrationOptions } from '~renderer/workspace/session-hydration-keys'

import type { AgentStatusWorktreeShutdownReason } from '../../agent/status-state/slice'
import type { TerminalTabCloseReason, TerminalTabRetirementPlan } from './tab-retirement'

type AutomaticAgentResumeClaim = {
  worktreeId: string
  launchAgent: TuiAgent
  providerSession: AgentProviderSessionMetadata
}

export type TerminalSlice = {
  tabsByWorktree: Record<string, TerminalTab[]>
  activeTabId: string | null
  /** Per-worktree last-active terminal tab — restored on worktree switch so
   *  the user returns to the same tab they left, not always tabs[0]. */
  activeTabIdByWorktree: Record<string, string | null>
  ptyIdsByTabId: Record<string, string[]>
  /** Live pane titles keyed by tabId then paneId. Unlike the legacy tab title,
   *  this preserves split-pane agent status per pane while TerminalPane is mounted. */
  runtimePaneTitlesByTabId: Record<string, Record<number, string>>
  /** Why: per-tab activity indicators. A tab gets flagged unread when terminal
   *  output requests attention (BEL) or an agent-complete notification is
   *  dispatched for one of its panes. The flag clears when the user activates
   *  or interacts with the tab. This is ephemeral UI state only — not
   *  persisted across restarts. */
  unreadTerminalTabs: Record<string, true>
  /** Pane-keyed attention marker for split-pane precision. This is narrower
   *  than unreadTerminalTabs and clears when the user interacts with the exact
   *  pane that raised attention. */
  unreadTerminalPanes: Record<string, true>
  /** Agent-completion source marker for focus-return auto-ack. Kept separate
   *  from unreadTerminalPanes so generic terminal bells still show until interact. */
  unreadAgentCompletionPanes: Record<string, true>
  // Remote guard keys must use renderer-visible, environment-scoped PTY ids;
  // raw runtime handles are only valid at the RPC boundary.
  suppressedPtyExitIds: Record<string, true>
  pendingCodexPaneRestartIds: Record<string, true>
  codexRestartNoticeByPtyId: Record<string, CodexRestartNotice>
  expandedPaneByTabId: Record<string, boolean>
  canExpandPaneByTabId: Record<string, boolean>
  terminalLayoutsByTabId: Record<string, TerminalLayoutSnapshot>
  /** Most recently run quick-command id per tab group. In-memory only; resets
   *  on app restart so a stale id from a deleted command can't surface as the
   *  split-button label across sessions. */
  recentQuickCommandIdByGroup: Record<string, string>
  setRecentQuickCommandForGroup: (groupId: string, quickCommandId: string) => void
  /** Runtime-only claim for automatic sleeping-session recovery tabs. It
   *  bridges the gap after startup payload consumption and before hooks go live. */
  automaticAgentResumeClaimsByTabId: Record<string, AutomaticAgentResumeClaim>
  claimAutomaticAgentResume: (tabId: string, claim: AutomaticAgentResumeClaim) => void
  pendingStartupByTabId: Record<
    string,
    {
      command: string
      /** Renderer-delivered startup input for callers that need xterm paste
       *  semantics before the submit Enter. */
      delivery?: 'terminal-paste'
      startupCommandDelivery?: StartupCommandDelivery
      env?: Record<string, string>
      envToDelete?: string[]
      launchConfig?: SleepingAgentLaunchConfig
      resumeProviderSession?: AgentProviderSessionMetadata
      launchToken?: string
      launchAgent?: TuiAgent
      draftPrompt?: string
      /** Initial prompt-start status for agents that lack native prompt hooks. */
      initialAgentStatus?: { agent: TuiAgent; prompt: string }
      /** Show the restored-session banner when this startup command mounts. */
      showSessionRestoredBanner?: boolean
      /** Telemetry metadata for the `agent_started` event. Threaded all the
       *  way to the `pty:spawn` IPC handler in main so the event fires only
       *  after spawn confirms — never on click-intent. */
      telemetry?: AgentStartedTelemetry
    }
  >
  pendingInitialCwdByTabId: Record<string, string>
  /** Queued setup-split requests — when present, TerminalPane creates the
   *  initial pane clean, then splits (vertical or horizontal per user setting)
   *  and runs the command in the new pane so the main terminal stays
   *  immediately interactive. */
  pendingSetupSplitByTabId: Record<
    string,
    { command: string; env?: Record<string, string>; direction: SetupSplitDirection }
  >
  tabBarOrderByWorktree: Record<string, string[]>
  workspaceSessionReady: boolean
  restoredRuntimeHostIdByWorkspaceSessionKey: Record<string, ExecutionHostId>
  defaultTerminalTabsAppliedByWorktreeId: Record<string, true>
  markDefaultTerminalTabsApplied: (worktreeId: string) => void
  /** True only after hydrateWorkspaceSession ran from a real load of
   *  agentstart-data.json. Guards the debounced session writer so that a crash
   *  during early startup (catalog query / session.get /
   *  hydrateWorkspaceSession itself) cannot cause an empty in-memory state
   *  to be serialized back over the user's good data on disk.
   *  Kept separate from workspaceSessionReady, which still flips true in
   *  the error path so the UI can mount without a rich session. */
  hydrationSucceeded: boolean
  setHydrationSucceeded: (value: boolean) => void
  pendingReconnectWorktreeIds: string[]
  pendingReconnectTabByWorktree: Record<string, string[]>
  /** Maps tabId → previous ptyId from the last session. When the PTY backend is
   *  a daemon, the old ptyId doubles as the daemon sessionId — passing it to
   *  spawn triggers createOrAttach which returns the surviving terminal snapshot. */
  pendingReconnectPtyIdByTabId: Record<string, string>
  // Why: relay session IDs (e.g. pty-0) are stored in tab.ptyId, but
  // clearTabPtyId nulls it on disconnect.  This map preserves the last
  // known ID so the session save can capture it even when the relay mux
  // is temporarily down — without it, remoteSessionIdsByTabId would be
  // empty and the relay PTY could not be reattached after restart.
  lastKnownRelayPtyIdByTabId: Record<string, string>
  /** ANSI snapshots returned by daemon reattach, keyed by the new ptyId.
   *  TerminalPane writes these to xterm.js to restore visual state. */
  pendingSnapshotByPtyId: Record<
    string,
    { snapshot: string; cols?: number; rows?: number; isAlternateScreen?: boolean }
  >
  consumePendingSnapshot: (
    ptyId: string
  ) => { snapshot: string; cols?: number; rows?: number; isAlternateScreen?: boolean } | null
  /** Cold restore data from disk history after a daemon crash, keyed by
   *  the new ptyId. Contains read-only scrollback to display above the
   *  fresh shell prompt. */
  pendingColdRestoreByPtyId: Record<string, { scrollback: string; cwd: string }>
  consumePendingColdRestore: (ptyId: string) => { scrollback: string; cwd: string } | null
  createTab: (
    worktreeId: string,
    targetGroupId?: string,
    shellOverride?: string,
    options?: {
      pendingActivationSpawn?: boolean
      initialPtyId?: string
      activate?: boolean
      recordInteraction?: boolean
      /** Pre-allocated tab id (e.g. minted by main for CLI/runtime-spawned
       *  terminals whose PTY env already carries a pane key). Falls back to
       *  minting a fresh id when omitted or when the supplied id collides
       *  with an existing tab anywhere in the store (tabIds form the global
       *  paneKey namespace, so collisions are checked across all worktrees). */
      id?: string
      /** Coding-harness agent being launched in this tab, recorded so the tab
       *  bar can show the provider icon before the agent's first hook event. */
      launchAgent?: TuiAgent
      quickCommandLabel?: string | null
      startupCwd?: string
    }
  ) => TerminalTab
  openNewTerminalTabInActiveWorkspace: (groupId: string) => Promise<void>
  closeTab: (
    tabId: string,
    opts?: {
      recordInteraction?: boolean
      reason?: TerminalTabCloseReason
      captureRecentlyClosed?: boolean
      remoteCloseOwnedByHost?: boolean
      localPtyTeardownOwnedExternally?: boolean
      precomputedRetirementPlan?: TerminalTabRetirementPlan
    }
  ) => void
  reorderTabs: (worktreeId: string, tabIds: string[]) => void
  setTabBarOrder: (worktreeId: string, order: string[]) => void
  setActiveTab: (tabId: string) => void
  setActiveTabForWorktree: (worktreeId: string, tabId: string) => void
  updateTabTitle: (tabId: string, title: string) => void
  setGeneratedTabTitleFromAgentPrompt: (
    paneKey: string,
    prompt: string,
    options?: { replaceExistingGeneratedTitle?: boolean }
  ) => void
  clearTabLaunchAgent: (tabId: string) => void
  setRuntimePaneTitle: (tabId: string, paneId: number, title: string) => void
  clearRuntimePaneTitle: (tabId: string, paneId: number) => void
  /** Mark a tab as having unread activity (agent working→idle transition).
   *  Skipped when the tab is currently visible to the user — either as
   *  the global active terminal tab, or as the active tab of any split
   *  group within the active worktree. A visible tab is already "seen",
   *  so a flag would never clear naturally. */
  markTerminalTabUnread: (tabId: string) => void
  markTerminalPaneUnread: (paneKey: string) => void
  markAgentCompletionPaneUnread: (paneKey: string) => void
  /** Clear a tab's unread indicator. Called on user interaction with the
   *  pane (keystroke, click) — matches ghostty's "show until interact"
   *  model where the bell stays visible until the user engages with the
   *  surface that raised it. */
  clearTerminalTabUnread: (tabId: string) => void
  clearTerminalPaneUnread: (paneKey: string) => void
  setTabCustomTitle: (
    tabId: string,
    title: string | null,
    opts?: { recordInteraction?: boolean }
  ) => void
  setTabColor: (tabId: string, color: string | null) => void
  updateTabPtyId: (tabId: string, ptyId: string, replacedPtyId?: string) => void
  clearTabPtyId: (tabId: string, ptyId?: string) => void
  shutdownWorktreeTerminals: (
    worktreeId: string,
    opts?: {
      keepIdentifiers?: boolean
      shutdownReason?: AgentStatusWorktreeShutdownReason
      sleepingPaneKeys?: string[]
      expectedRuntimePtyIds?: string[]
    }
  ) => Promise<void>
  shutdownCompletedAgentPaneForHibernation: (
    worktreeId: string,
    opts: {
      paneKey: string
      tabId: string
      leafId: string
      ptyId: string
      expectedRuntimePtyId?: string
    }
  ) => Promise<void>
  suppressPtyExit: (ptyId: string) => void
  consumeSuppressedPtyExit: (ptyId: string) => boolean
  queueCodexPaneRestarts: (ptyIds: string[]) => void
  consumePendingCodexPaneRestart: (ptyId: string) => boolean
  markCodexRestartNotices: (
    notices: { ptyId: string; previousAccountLabel: string; nextAccountLabel: string }[]
  ) => void
  clearCodexRestartNotice: (ptyId: string) => void
  setTabPaneExpanded: (tabId: string, expanded: boolean) => void
  setTabCanExpandPane: (tabId: string, canExpand: boolean) => void
  setTabLayout: (tabId: string, layout: TerminalLayoutSnapshot | null) => void
  syncPaneDetachPtyOwnership: (args: {
    detachedLeafId: string
    detachedPtyId: string | null
    sourceLayout: TerminalLayoutSnapshot
    sourceTabId: string
    targetTabId: string
  }) => void
  queueTabStartupCommand: (
    tabId: string,
    startup: {
      command: string
      delivery?: 'terminal-paste'
      startupCommandDelivery?: StartupCommandDelivery
      env?: Record<string, string>
      envToDelete?: string[]
      launchConfig?: SleepingAgentLaunchConfig
      resumeProviderSession?: AgentProviderSessionMetadata
      launchToken?: string
      launchAgent?: TuiAgent
      draftPrompt?: string
      initialAgentStatus?: { agent: TuiAgent; prompt: string }
      showSessionRestoredBanner?: boolean
      telemetry?: AgentStartedTelemetry
    }
  ) => void
  queueTabInitialCwd: (tabId: string, cwd: string) => void
  consumeTabInitialCwd: (tabId: string) => string | null
  consumeTabStartupCommand: (tabId: string) => {
    command: string
    delivery?: 'terminal-paste'
    startupCommandDelivery?: StartupCommandDelivery
    env?: Record<string, string>
    envToDelete?: string[]
    launchConfig?: SleepingAgentLaunchConfig
    resumeProviderSession?: AgentProviderSessionMetadata
    launchToken?: string
    launchAgent?: TuiAgent
    draftPrompt?: string
    initialAgentStatus?: { agent: TuiAgent; prompt: string }
    showSessionRestoredBanner?: boolean
    telemetry?: AgentStartedTelemetry
  } | null
  queueTabSetupSplit: (
    tabId: string,
    startup: { command: string; env?: Record<string, string>; direction: SetupSplitDirection }
  ) => void
  consumeTabSetupSplit: (
    tabId: string
  ) => { command: string; env?: Record<string, string>; direction: SetupSplitDirection } | null
  /** Per-pane timestamp (ms) when the prompt-cache countdown started (agent became idle).
   *  Keys are `${tabId}:${leafId}` composites so split-pane tabs can track each pane
   *  independently. null means no active timer for that pane. */
  cacheTimerByKey: Record<string, number | null>
  setCacheTimerStartedAt: (key: string, ts: number | null) => void
  /** Wall-clock user input markers keyed by paneKey. Hibernation uses these to
   *  avoid sleeping a completed agent pane that the user has turned into a shell. */
  lastTerminalInputAtByPaneKey: Record<string, number>
  recordTerminalInput: (paneKey: string, timestamp?: number) => void
  /** Scan all tabs and seed cache timers for any idle Claude sessions that don't
   *  already have a timer. Called when the feature is enabled mid-session. */
  seedCacheTimersForIdleTabs: () => void
  /** SSH target IDs that require a passphrase — deferred to on-demand
   *  reconnect when the user focuses an affected terminal tab. */
  deferredSshReconnectTargets: string[]
  setDeferredSshReconnectTargets: (targetIds: string[]) => void
  removeDeferredSshReconnectTarget: (targetId: string) => void
  hydrateWorkspaceSession: (
    session: WorkspaceSessionState,
    options?: HydrateWorkspaceSessionOptions
  ) => void
  reconnectPersistedTerminals: (signal?: AbortSignal) => Promise<void>
}

type HydrateWorkspaceSessionOptions = {
  runtimeHostIdByWorkspaceSessionKey?: Record<string, ExecutionHostId>
} & WorkspaceSessionHydrationOptions

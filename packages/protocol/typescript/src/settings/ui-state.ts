import type { FeatureInteractionState } from '../telemetry/interactions/state.js'
import type { WorkspaceCleanupUIState } from '../workspace/cleanup-policy.js'
import type { WorkspaceStatusDefinition } from '../workspace/status/model.js'
import type { WorkspacePanelTabContentType } from '../workspace/tabs.js'
import type { PersistedTrustedYiruHooks } from '../worktree/hooks.js'
import type { ContextualTourId } from './contextual-tours.js'
import type { FeatureTipId } from './feature-tips.js'
import type { ThemeGradientTheme } from './theme-gradient.js'
import type { StatusBarUsageMode } from './usage-display.js'
import type { UsagePercentageDisplay } from './usage-display.js'

export type WorktreeCardProperty =
  | 'status'
  | 'unread'
  | 'branch'
  | 'comment'
  | 'ports'
  // Why: live agent activity is a primary card signal, so it stays enabled by
  // default while remaining optional in the Card display menu.
  | 'inline-agents'

export type AgentActivityDisplayMode = 'compact' | 'full'

export type StatusBarItem =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'antigravity'
  | 'opencode-go'
  | 'kimi'
  | 'minimax'
  | 'grok'
  | 'resource-usage'
  | 'ports'
export type RightSidebarTab = WorkspacePanelTabContentType | 'search'
export type ActiveRightSidebarTab = WorkspacePanelTabContentType
/** Titlebar strip actions: workspace panels, Open in, and Command. */
export type WorkspaceTitlebarActionId = ActiveRightSidebarTab | 'open-in' | 'commands'
export type RightSidebarExplorerView = 'files' | 'search'

export type ProjectOrderBy = 'manual' | 'recent'
export type WorkspaceHostScope = 'all' | ExecutionHostId
export type VisibleWorkspaceHostIds = Exclude<WorkspaceHostScope, 'all'>[] | null
export type WorkspaceHostOrder = Exclude<WorkspaceHostScope, 'all'>[]
export type ManualRepoOrderEntry = {
  hostId: WorkspaceHostOrder[number]
  repoId: string
}

/** The active top-level section shown in the main content area. */
export type TopLevelView = 'home' | 'terminal' | 'settings' | 'space' | 'skills' | 'mobile'

export type PersistedUIState = {
  lastActiveRepoId: string | null
  lastActiveWorktreeId: string | null
  /** Active top-level view at save time, restored on reload/relaunch so the app
   *  reopens where the user left off instead of snapping back to the terminal.
   *  Sanitized on hydration (unknown value or a now-gated view falls back to
   *  'terminal'). */
  activeView: TopLevelView
  sidebarWidth: number
  rightSidebarOpen: boolean
  rightSidebarTab: RightSidebarTab
  rightSidebarExplorerView: RightSidebarExplorerView
  rightSidebarWidth: number
  markdownTocPanelWidth?: number
  groupBy: 'none' | 'workspace-status' | 'repo' | 'pr-status'
  sortBy: 'name' | 'smart' | 'recent' | 'repo' | 'manual'
  /** Project header ordering in `groupBy: 'repo'`, independent of workspace
   *  `sortBy`. 'manual' (default) uses the persisted repo order and enables
   *  header drag; 'recent' orders by each project's most recent visible
   *  workspace activity. */
  projectOrderBy: ProjectOrderBy
  /** Deprecated; the Active only filter is retired and ignored on hydration. */
  showActiveOnly: boolean
  /** Hide sleeping/inactive workspaces from workspace navigation. Off by default. */
  hideSleepingWorkspaces?: boolean
  /** Which execution hosts the workspace sidebar shows. `all` keeps the mixed
   *  command-center view; specific host IDs focus the sidebar without tearing
   *  down sessions owned by other hosts. */
  workspaceHostScope?: WorkspaceHostScope
  /** Which execution hosts the workspace sidebar shows. `null` means sticky
   *  all-hosts so newly-added hosts appear automatically. */
  visibleWorkspaceHostIds?: VisibleWorkspaceHostIds
  /** User-defined sidebar order for host sections. Missing/new hosts append in
   *  the discovered host order. */
  workspaceHostOrder?: WorkspaceHostOrder
  /** Desktop-owned all-host repo order. Host-qualified identities preserve a
   *  manual cross-host interleaving while each host owns its local permutation. */
  manualRepoOrder?: ManualRepoOrderEntry[]
  /** Deprecated legacy positive-form setting. Ignored on hydration. */
  showSleepingWorkspaces?: boolean
  /** Deprecated legacy name used by a short-lived build. Ignored on hydration. */
  showInactiveWorkspaces?: boolean
  /** Hide the repo's original checked-out branch from workspace navigation
   *  (sidebar and Cmd+J jump palette). Folder-mode repos are unaffected —
   *  the predicate in visible-worktrees.ts excludes worktrees with an empty
   *  branch. */
  hideDefaultBranchWorkspace: boolean
  /** Per-worktree Explorer dotfile visibility. Missing entries inherit the default: show. */
  showDotfilesByWorktree?: Record<string, boolean>
  filterRepoIds: string[]
  collapsedGroups: string[]
  uiZoomLevel: number
  editorFontZoomLevel: number
  worktreeCardProperties: WorktreeCardProperty[]
  agentActivityDisplayMode?: AgentActivityDisplayMode
  workspaceStatuses?: WorkspaceStatusDefinition[]
  /** One-shot migration flag for a short-lived build that persisted the
   *  default workspace statuses in reverse workflow order. Once stamped,
   *  user-authored status ordering is never inferred from IDs/labels again. */
  _workspaceStatusesDefaultOrderMigrated?: boolean
  /** One-shot repair flag for the exact default payload that a short-lived
   *  build persisted in reverse workflow order. */
  _workspaceStatusesReorderedDefaultRepaired?: boolean
  /** One-shot migration flag for default status workflow labels/visuals.
   *  Exact legacy default payloads migrate; customized statuses are preserved. */
  _workspaceStatusesDefaultWorkflowMigrated?: boolean
  /** One-shot migration flag for the old default blue/violet/emerald status
   *  visuals. Once stamped, valid user-authored colors/icons are preserved. */
  _workspaceStatusesDefaultVisualsMigrated?: boolean
  /** One-shot migration flag for adding the default-on Ports status item. */
  _portsStatusBarDefaultAdded?: boolean
  /** One-shot migration flag for adding the default-on Kimi status item. */
  _kimiStatusBarDefaultAdded?: boolean
  /** One-shot migration flag for adding the default-on MiniMax status item. */
  _minimaxStatusBarDefaultAdded?: boolean
  /** One-shot migration flag for adding the default-on Antigravity status item. */
  _antigravityStatusBarDefaultAdded?: boolean
  /** One-shot migration flag for adding the default-on Grok status item. */
  _grokStatusBarDefaultAdded?: boolean
  statusBarItems: StatusBarItem[]
  statusBarVisible: boolean
  /** Ordered ids pinned to the workspace titlebar strip (panels + Open in).
   *  Remaining available actions live in the More menu and can be dragged in/out. */
  workspacePanelTitlebarPinnedIds?: WorkspaceTitlebarActionId[]
  /** Why: this is client-side presentation, not a provider/account or execution-host setting. */
  usagePercentageDisplay?: UsagePercentageDisplay
  /** Why: usage roster density follows the user across native, web, and SSH runtimes. */
  statusBarUsageMode?: StatusBarUsageMode
  lastUpdateCheckAt: number | null
  pendingUpdateNudgeId?: string | null
  dismissedUpdateNudgeId?: string | null
  /** Whether Yiru has already attempted to trigger the macOS notification
   *  permission dialog via a startup notification. Prevents re-firing on
   *  every launch. */
  notificationPermissionRequested?: boolean
  /** Per-paneKey "user has visited this row" timestamps, used by the inline
   *  agents list to mute rows the user has already seen. Persisted because
   *  agent rows themselves now survive restart; without persisting acks too,
   *  rows you'd already clicked come back bold on relaunch. Stale entries
   *  keyed on dead panes are inert: a future paneKey reuse stamps a fresh
   *  stateStartedAt that beats the old ack via the existing comparison in
   *  WorktreeCardAgents. Renderer-owned, written through ui:set. */
  acknowledgedAgentsByPaneKey?: Record<string, number>
  /** User-hidden sidebar entry for the setup guide. The Help menu remains
   *  available so this is a reversible declutter preference, not completion. */
  setupGuideSidebarDismissed?: boolean
  /** One-shot migration marker for the browser setup-guide milestone. Existing
   *  profiles missing this marker are evaluated once in the renderer because
   *  full checklist completion depends on runtime probes. */
  setupGuideBrowserMilestoneMigrated?: boolean
  /** Existing users who completed or dismissed the pre-browser checklist stay
   *  complete after the browser milestone is added. */
  setupGuideBrowserMilestoneLegacyComplete?: boolean
  /** User-dismissed browser import hint in the browser toolbar. Import remains
   *  available from Settings > Browser and the toolbar overflow menu. */
  browserImportHintHidden?: boolean
  /** User dismissed the first-run Mobile Emulator intro (Keep, Hide, or close).
   *  Reversible only by re-enabling the feature in Settings. */
  mobileEmulatorTabIntroDismissed?: boolean
  /** User deferred the in-pane Mobile Emulator CLI + skill setup guide. */
  mobileEmulatorAgentSetupDismissed?: boolean
  /** One-shot rollout notice for manual project ordering becoming the default.
   *  Absent or true means the sidebar callout stays hidden. */
  projectOrderManualDefaultNoticeDismissed?: boolean
  /** One-shot notice that status-bar usage meters now show percent used (not
   *  remaining). Absent is resolved on load: brand-new profiles default to
   *  dismissed; upgraded profiles see the notice once. */
  usagePercentageDisplayChangeNoticeDismissed?: boolean
  /** User-hidden empty-state usage CTA in the status bar. Permanently hides the
   *  "Connect AI accounts to see usage" prompt even if all providers are later
   *  disconnected — a dismissed teaching nudge stays dismissed. */
  usageEmptyStateDismissed?: boolean
  /** URL to navigate to when a new browser tab is opened. Null means blank tab.
   *  Phase 3 will expand this to a full BrowserSessionProfile per workspace. */
  browserDefaultUrl?: string | null
  browserDefaultSearchEngine?: 'google' | 'duckduckgo' | 'bing' | 'kagi' | null
  /** Chromium zoom level applied when a new local browser tab is created. */
  browserDefaultZoomLevel?: number
  /** Optional Kagi private-session link used only when Kagi is the search engine. */
  browserKagiSessionLink?: string | null
  /** One-shot migration flag: 'recent' used to mean the weighted smart sort
   *  (v1→v2 rename). When this flag is absent and sortBy is 'recent', the
   *  main-process load() migrates it to 'smart' and sets this flag so the
   *  migration never re-fires — allowing users to intentionally select the
   *  new 'recent' (last-activity) sort without it being clobbered on restart. */
  _sortBySmartMigrated?: boolean
  /** LEGACY one-shot flag from the experimental-toggle era of the inline
   *  agents feature. It was stamped unconditionally on every successful
   *  load() in prior builds (regardless of whether the experiment was on),
   *  so it cannot be used to detect "already migrated under the new
   *  default-on rules" — every prior-RC user already has it set to true on
   *  disk. Kept persisted for forward-compat with rollback to a pre-default-on
   *  build that still reads it; the actual migration gate is now
   *  `_inlineAgentsDefaultedForAllUsers` below. */
  _inlineAgentsDefaultedForExperiment?: boolean
  /** One-shot migration flag for the default-on rollout of the inline
   *  agents feature. Set once on first load after upgrade once the
   *  'inline-agents' card property has been ensured in
   *  `worktreeCardProperties`. Distinct from
   *  `_inlineAgentsDefaultedForExperiment` because that legacy flag was
   *  stamped on every prior load and so is permanently dirty for the
   *  prior-RC opt-out cohort the widened migration is meant to reach. */
  _inlineAgentsDefaultedForAllUsers?: boolean
  /** One-shot migration flag for card properties that were split out after
   *  the original metadata toggles shipped. Set once so later deliberate
   *  later property choices stick across restarts. */
  _expandedWorktreeCardPropertiesDefaulted?: boolean
  /** Snapshot of totalAgentsSpawned captured the first time we see the current
   *  app version. Why: the nag threshold counts agents spawned *since the
   *  user's last update* so a fresh install or new release does not trigger
   *  the notification immediately. Reset whenever starNagAppVersion changes. */
  starNagBaselineAgents?: number | null
  /** The app version that set the current baseline. When the live app version
   *  differs from this value, the baseline is re-captured on next agent
   *  spawn — effectively restarting the nag countdown after each update. */
  starNagAppVersion?: string | null
  /** Next threshold (agents spawned since baseline) at which the star-nag
   *  notification should fire. Starts at 35 and doubles each time the user
   *  dismisses the notification without starring. */
  starNagNextThreshold?: number
  /** Once the user has starred Yiru (from any entry point) we permanently
   *  suppress the nag — no further thresholds, no notifications. */
  starNagCompleted?: boolean
  /** Timestamp until which nonterminal dismissals suppress threshold prompts.
   *  Force-show bypasses this for dev/testing. */
  starNagDeferredUntil?: number | null
  /** App version that already consumed the first successful-agent value-moment ask.
   *  Main-owned so remote/web clients cannot spoof the once-per-version cap. */
  starNagAgentValueMomentAppVersion?: string | null
  trustedYiruHooks?: PersistedTrustedYiruHooks
  /** Workspace theme gradient used by workspaces without their own. `null` is a
   *  deliberate "no theme", distinct from an absent key. */
  themeGradientDefault?: ThemeGradientTheme | null
  /** Per-workspace theme gradient overrides, keyed by worktree ID. */
  themeGradientsByWorkspaceId?: Record<string, ThemeGradientTheme>
  setupScriptPromptDismissedRepoIds?: string[]
  workspaceCleanup?: WorkspaceCleanupUIState
  /** Feature tips already surfaced to the user. Startup only opens the tips
   *  modal when this list is missing one of the current tip ids. */
  featureTipsSeenIds?: FeatureTipId[]
  /** Local product-state facts: feature ids the user has actually used.
   *  Used by education surfaces to avoid teaching already-discovered features. */
  featureInteractions?: FeatureInteractionState
  /** Contextual tours already surfaced to the user. Unknown ids are ignored
   *  during hydration so downgrade/upgrade cycles remain forward-compatible. */
  contextualToursSeenIds?: ContextualTourId[]
  /** Whether this profile may receive automatic contextual tours from this
   *  rollout. Missing means the renderer has not classified the profile yet. */
  contextualToursAutoEligible?: boolean
}
import type { ExecutionHostId } from '../host/identity.js'

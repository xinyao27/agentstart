import { DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS } from '@agentstart/protocol/settings/panel-titlebar-pins'
import { DEFAULT_STATUS_BAR_ITEMS } from '@agentstart/protocol/settings/status-bar'
import { DEFAULT_STATUS_BAR_USAGE_MODE } from '@agentstart/protocol/settings/usage-display'
import { DEFAULT_USAGE_PERCENTAGE_DISPLAY } from '@agentstart/protocol/settings/usage-display'
import {
  DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE,
  DEFAULT_SHOW_SLEEPING_WORKSPACES
} from '@agentstart/protocol/settings/workspace-preferences'
import { DEFAULT_WORKTREE_CARD_PROPERTIES } from '@agentstart/protocol/settings/worktree-card-properties'
import type { LaunchSource } from '@agentstart/protocol/telemetry/events/foundations'
import { cloneDefaultWorkspaceStatuses } from '@agentstart/protocol/workspace/status/normalize'
import type { StateCreator } from 'zustand'
import { DEFAULT_BROWSER_PAGE_ZOOM_LEVEL } from '~renderer/browser/zoom'

import type { AppState } from '../../store/types'
import type { UISlice } from './slice-state'
export type { UISlice } from './slice-state'
import { createUIAgentSendActions } from './agent-send-actions'
import { createUIContextualTourActions } from './contextual-tour-actions'
import { createUIFeatureActions } from './feature-actions'
import { createUIHydrationActions } from './hydration-actions'
import { createUINavigationActions } from './navigation-actions'
import { createUIPortActions } from './port-actions'
import { createUIRevealActions } from './reveal-actions'
import { createUITrustActions } from './trust-actions'
import { createUIUpdateActions } from './update-actions'
import { createUIWorkspacePreferenceActions } from './workspace-preference-actions'

export type PendingSidebarWorktreeReveal = {
  worktreeId: string
  behavior: 'auto' | 'smooth'
  highlight?: boolean
  beginRename?: boolean
}

export type PendingSidebarRowReveal = {
  rowKey: string
  behavior: 'auto' | 'smooth'
  highlight?: boolean
}

export type AgentSendPopoverTargetMode = {
  id: string
  instanceId: string
  worktreeId: string
  source: 'diff-notes' | 'browser-annotations'
  prompt: string
  label: string
  launchSource: LaunchSource
  eligiblePaneKeys: string[]
  disabledPaneKeys: Record<string, string>
  status: 'open' | 'sending' | 'error'
  sendingPaneKey?: string
  error?: string
  onPromptDelivered?: () => void
}

export type OpenAgentSendPopoverTargetModeArgs = {
  id: string
  worktreeId: string
  source: AgentSendPopoverTargetMode['source']
  prompt: string
  label: string
  launchSource: LaunchSource
  onPromptDelivered?: () => void
}

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
  sidebarOpen: true,
  sidebarWidth: 280,
  ...createUIAgentSendActions(set, get),
  agentSendPopoverTargetMode: null,
  diffNotesSendMenuOpenRequest: null,
  acknowledgedAgentsByPaneKey: {},
  activeView: 'home',
  previousViewBeforeSettings: 'terminal',
  previousViewBeforeSpace: 'terminal',
  previousViewBeforeSkills: 'terminal',
  previousViewBeforeMobile: 'terminal',
  ...createUINavigationActions(set, get),
  newWorkspaceDraft: null,
  settingsNavigationTarget: null,
  settingsProjectHostSelection: {},
  // Why: renderer-only, never persisted — no setRuntimeUIState here and this
  // field is intentionally absent from the debounced UI writer in application-shell.tsx.
  appearanceAccordionDeepLink: null,
  activeModal: 'none',
  modalData: {},
  featureTipsSeenIds: [],
  ...createUIFeatureActions(set, get),
  featureInteractions: {},
  contextualToursSeenIds: [],
  contextualToursAutoEligible: null,
  activeContextualTourId: null,
  activeContextualTourStepIndex: 0,
  activeContextualTourSource: null,
  activeContextualTourSourceDetached: false,
  activeContextualTourWasFeaturePreviouslyInteracted: false,
  contextualTourNavigationInteractionSnapshot: {},
  activeContextualTourSuppressed: false,
  contextualTourShownThisSession: false,
  contextualToursOnboardingVisible: false,
  contextualToursBlockingSurfaceVisible: false,
  lastCompletedContextualTourId: null,
  ...createUIContextualTourActions(set, get),
  trustedAgentStartHooks: {},
  ...createUITrustActions(set, get),
  setupScriptPromptDismissedRepoIds: [],
  setupGuideSidebarDismissed: false,
  setupGuideBrowserMilestoneMigrated: true,
  setupGuideBrowserMilestoneLegacyComplete: false,
  browserImportHintHidden: false,
  mobileEmulatorTabIntroDismissed: false,
  mobileEmulatorAgentSetupDismissed: false,
  projectOrderManualDefaultNoticeDismissed: true,
  // Why: defaults true so pre-hydration / brand-new sessions never flash the
  // change notice before persistence resolves eligibility.
  usagePercentageDisplayChangeNoticeDismissed: true,
  usageEmptyStateDismissed: false,
  groupBy: 'repo',
  // Why: group keys are mode-specific (e.g. repo id vs PR status), so
  // collapsed state from one mode is meaningless in another. Clearing
  // also prevents unbounded accumulation of stale keys across mode switches.
  ...createUIWorkspacePreferenceActions(set, get),

  sortBy: 'recent',
  // Why: like setSortBy, this is a bare set — it persists only via the
  // debounced setRuntimeUIState writer in application-shell.tsx, not on its own.
  projectOrderBy: 'manual',
  showActiveOnly: false,
  showSleepingWorkspaces: DEFAULT_SHOW_SLEEPING_WORKSPACES,
  workspaceHostScope: 'all',
  // Why (multi-host design): host scope is presentation/filtering only — it must
  // never trigger resource teardown (terminals, browser pages, etc.).
  visibleWorkspaceHostIds: null,
  workspaceHostOrder: [],
  manualRepoOrder: [],

  hideDefaultBranchWorkspace: false,
  showDotfilesByWorktree: {},
  filterRepoIds: [],
  collapsedGroups: new Set<string>(),
  worktreeCardProperties: [...DEFAULT_WORKTREE_CARD_PROPERTIES],
  agentActivityDisplayMode: DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE,

  workspaceStatuses: cloneDefaultWorkspaceStatuses(),
  statusBarItems: [...DEFAULT_STATUS_BAR_ITEMS],
  statusBarVisible: true,
  workspacePanelTitlebarPinnedIds: [...DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS],
  usagePercentageDisplay: DEFAULT_USAGE_PERCENTAGE_DISPLAY,
  statusBarUsageMode: DEFAULT_STATUS_BAR_USAGE_MODE,
  workspacePortScan: null,
  workspacePortScansByKey: {},
  workspacePortScanRefreshing: false,
  ...createUIPortActions(set, get),
  // Why: target changes rebuild the aggregate without republishing or clearing per-host scans.
  // Why: host-set changes must remove stale per-host scans in one store update so a
  // large disconnected host set cannot fan out map notifications to every subscriber.
  pendingRevealWorktree: null,
  pendingRevealSidebarRow: null,
  ...createUIRevealActions(set, get),
  scrollToDiffCommentId: null,
  persistedUIReady: false,
  uiZoomLevel: 0,
  editorFontZoomLevel: 0,
  ...createUIHydrationActions(set, get),

  updateStatus: { state: 'idle' },
  ...createUIUpdateActions(set, get),
  isFullScreen: false,
  browserDefaultUrl: null,
  browserDefaultSearchEngine: null,
  browserDefaultZoomLevel: DEFAULT_BROWSER_PAGE_ZOOM_LEVEL,
  browserKagiSessionLink: null
})

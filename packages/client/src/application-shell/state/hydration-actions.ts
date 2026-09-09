import {
  normalizeExecutionHostOrder,
  normalizeExecutionHostScope
} from '@yiru/protocol/host/identity'
import { normalizeManualRepoOrder } from '@yiru/protocol/project/manual-order'
import { normalizeContextualTourIds } from '@yiru/protocol/settings/contextual-tours'
import { normalizeFeatureTipIds } from '@yiru/protocol/settings/feature-tips'
import { clampMarkdownTocPanelWidth } from '@yiru/protocol/settings/markdown-toc'
import { normalizeWorkspacePanelTitlebarPinnedIds } from '@yiru/protocol/settings/panel-titlebar-pins'
import { normalizeStatusBarItems } from '@yiru/protocol/settings/status-bar'
import {
  normalizeThemeGradient,
  normalizeThemeGradientsByWorkspace
} from '@yiru/protocol/settings/theme-gradient'
import { normalizeStatusBarUsageMode } from '@yiru/protocol/settings/usage-display'
import { normalizeUsagePercentageDisplay } from '@yiru/protocol/settings/usage-display'
import {
  DEFAULT_HIDE_SLEEPING_WORKSPACES,
  normalizeAgentActivityDisplayMode
} from '@yiru/protocol/settings/workspace-preferences'
import { normalizeWorktreeCardProperties } from '@yiru/protocol/settings/worktree-card-properties'
import { normalizeFeatureInteractions } from '@yiru/protocol/telemetry/interactions/state'
import { normalizeWorkspaceStatuses } from '@yiru/protocol/workspace/status/normalize'
import type { StateCreator } from 'zustand'
import { normalizeKagiSessionLink } from '~renderer/browser/session/kagi-link'
import { normalizeBrowserPageZoomLevel } from '~renderer/browser/zoom'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import {
  filterSetupScriptPromptDismissalsToValidRepos,
  sanitizeSetupScriptPromptDismissals
} from '~renderer/sidebar/setup-script-prompt'

import type { AppState } from '../../store/types'
import { normalizeRightSidebarRoute } from '../../workspace-panel/right-sidebar-route'
import {
  DEFAULT_ON_PORTS_STATUS_BAR_ITEM,
  normalizeHydratedVisibleWorkspaceHostIds,
  MAX_LEFT_SIDEBAR_WIDTH,
  MAX_RIGHT_SIDEBAR_WIDTH,
  sanitizePersistedRepoIds,
  hydrateTrustedYiruHooks,
  sanitizeShowDotfilesByWorktree,
  sanitizePersistedSidebarWidth,
  sanitizeAcknowledgedAgentsByPaneKey,
  sanitizeWorkspaceCleanupDismissals,
  hydratedUIPartialMatchesState
} from './persistence-model'
import type { UISlice } from './slice'
import { sanitizeHydratedActiveView } from './view-model'

const FIXED_WORKSPACE_GROUP_BY: UISlice['groupBy'] = 'repo'

export function createUIHydrationActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<UISlice, 'hydratePersistedUI'> {
  return {
    hydratePersistedUI: (ui, source = 'sync') => {
      const catalogState = readProjectCatalogRuntimeState()
      set((s) => {
        const manualRepoOrder = normalizeManualRepoOrder(ui.manualRepoOrder)
        const validRepoIds = new Set(catalogState.repos.map((repo) => repo.id))
        const persistedFilterRepoIds = sanitizePersistedRepoIds(ui.filterRepoIds)
        // Migration history:
        // v1: sort was called 'smart' internally
        // v2: renamed 'smart' → 'recent' (same weighted-score behavior)
        // v3: 'smart' reintroduced as the weighted-score sort, 'recent' becomes
        //     a last-activity sort (worktree.lastActivityAt descending). The
        //     one-shot migration from old 'recent' to 'smart' happens in the
        //     main process (persistence.ts load()) using the _sortBySmartMigrated
        //     flag — not here — so that users who intentionally select the new
        //     'recent' sort keep it across restarts.
        const sortBy = ui.sortBy
        const migratedStatusBarItems = normalizeStatusBarItems(ui.statusBarItems)
        const statusBarItemsWithPorts =
          ui._portsStatusBarDefaultAdded || migratedStatusBarItems.includes('ports')
            ? migratedStatusBarItems
            : [...migratedStatusBarItems, DEFAULT_ON_PORTS_STATUS_BAR_ITEM]
        const persistedStatusBarItems = ui.statusBarItems ?? []
        const statusBarItemsChanged =
          persistedStatusBarItems.length !== statusBarItemsWithPorts.length ||
          persistedStatusBarItems.some((item, index) => item !== statusBarItemsWithPorts[index])
        const historicalStatusBarDefaultsHandled =
          ui._portsStatusBarDefaultAdded &&
          ui._kimiStatusBarDefaultAdded &&
          ui._minimaxStatusBarDefaultAdded &&
          ui._antigravityStatusBarDefaultAdded &&
          ui._grokStatusBarDefaultAdded
        if (
          (statusBarItemsChanged || !historicalStatusBarDefaultsHandled) &&
          typeof window !== 'undefined'
        ) {
          setRuntimeUIState(get().settings, {
            statusBarItems: statusBarItemsWithPorts,
            // Why: retire the former provider-default migrations without
            // re-enabling their meters when this quieter default is hydrated.
            _portsStatusBarDefaultAdded: true,
            _kimiStatusBarDefaultAdded: true,
            _minimaxStatusBarDefaultAdded: true,
            _antigravityStatusBarDefaultAdded: true,
            _grokStatusBarDefaultAdded: true
          }).catch(console.error)
        }
        const rightSidebarRoute = normalizeRightSidebarRoute(
          ui.rightSidebarTab,
          ui.rightSidebarExplorerView
        )
        const hydrated = {
          // Why: persisted UI data comes from disk and may be stale, corrupted,
          // or manually edited. Clamp widths during hydration so invalid values
          // cannot push the renderer into broken layouts before the user drags a
          // sidebar again.
          sidebarWidth: sanitizePersistedSidebarWidth(
            ui.sidebarWidth,
            s.sidebarWidth,
            MAX_LEFT_SIDEBAR_WIDTH
          ),
          rightSidebarWidth: sanitizePersistedSidebarWidth(
            ui.rightSidebarWidth,
            s.rightSidebarWidth,
            MAX_RIGHT_SIDEBAR_WIDTH
          ),
          markdownTocPanelWidth: clampMarkdownTocPanelWidth(
            ui.markdownTocPanelWidth,
            undefined,
            s.markdownTocPanelWidth
          ),
          rightSidebarOpen: typeof ui.rightSidebarOpen === 'boolean' ? ui.rightSidebarOpen : true,
          rightSidebarTab: rightSidebarRoute.rightSidebarTab,
          rightSidebarExplorerView: rightSidebarRoute.rightSidebarExplorerView,
          // Why: Project -> Workspace is the single list hierarchy on every client;
          // ignore legacy persisted grouping modes instead of reviving the old switcher.
          groupBy: FIXED_WORKSPACE_GROUP_BY,
          sortBy,
          // Why: main-process getUI() already normalized this to a valid value
          // (defaulting to 'manual'); read it through without migrating sortBy.
          projectOrderBy: ui.projectOrderBy,
          // Why: Active-only was retired. Force the old persisted flag off so an
          // old profile cannot invisibly keep narrowing the workspace list.
          showActiveOnly: false,
          // Why: `hideSleepingWorkspaces` is the canonical negative-form filter.
          // Older positive-form keys are intentionally ignored so old profiles
          // start from the new default: sleeping workspaces visible.
          showSleepingWorkspaces: !(ui.hideSleepingWorkspaces ?? DEFAULT_HIDE_SLEEPING_WORKSPACES),
          workspaceHostScope: normalizeExecutionHostScope(ui.workspaceHostScope),
          themeGradientDefault: normalizeThemeGradient(ui.themeGradientDefault),
          themeGradientsByWorkspaceId: normalizeThemeGradientsByWorkspace(
            ui.themeGradientsByWorkspaceId
          ),
          visibleWorkspaceHostIds: normalizeHydratedVisibleWorkspaceHostIds(ui),
          workspaceHostOrder: normalizeExecutionHostOrder(ui.workspaceHostOrder),
          manualRepoOrder,
          hideDefaultBranchWorkspace: ui.hideDefaultBranchWorkspace ?? false,
          showDotfilesByWorktree: sanitizeShowDotfilesByWorktree(ui.showDotfilesByWorktree),
          // Why: startup hydrates UI before repo catalogs now. With no catalog
          // loaded yet, defer repo-filter validation to the all-host repo refresh.
          filterRepoIds:
            validRepoIds.size === 0
              ? persistedFilterRepoIds
              : persistedFilterRepoIds.filter((repoId) => validRepoIds.has(repoId)),
          collapsedGroups: new Set(ui.collapsedGroups ?? []),
          uiZoomLevel: ui.uiZoomLevel ?? 0,
          editorFontZoomLevel: ui.editorFontZoomLevel ?? 0,
          worktreeCardProperties: normalizeWorktreeCardProperties(ui.worktreeCardProperties),
          agentActivityDisplayMode: normalizeAgentActivityDisplayMode(ui.agentActivityDisplayMode),
          workspaceStatuses: normalizeWorkspaceStatuses(ui.workspaceStatuses),
          statusBarItems: statusBarItemsWithPorts,
          statusBarVisible: ui.statusBarVisible ?? true,
          workspacePanelTitlebarPinnedIds: normalizeWorkspacePanelTitlebarPinnedIds(
            ui.workspacePanelTitlebarPinnedIds
          ),
          usagePercentageDisplay: normalizeUsagePercentageDisplay(ui.usagePercentageDisplay),
          statusBarUsageMode: normalizeStatusBarUsageMode(ui.statusBarUsageMode),
          browserDefaultUrl: ui.browserDefaultUrl ?? null,
          browserDefaultSearchEngine: ui.browserDefaultSearchEngine ?? null,
          browserDefaultZoomLevel: normalizeBrowserPageZoomLevel(ui.browserDefaultZoomLevel),
          browserKagiSessionLink: normalizeKagiSessionLink(ui.browserKagiSessionLink ?? ''),
          featureTipsSeenIds: normalizeFeatureTipIds(ui.featureTipsSeenIds),
          featureInteractions: normalizeFeatureInteractions(ui.featureInteractions),
          contextualToursSeenIds: normalizeContextualTourIds(ui.contextualToursSeenIds),
          contextualToursAutoEligible:
            typeof ui.contextualToursAutoEligible === 'boolean'
              ? ui.contextualToursAutoEligible
              : null,
          trustedYiruHooks: hydrateTrustedYiruHooks(ui.trustedYiruHooks, validRepoIds),
          setupScriptPromptDismissedRepoIds:
            validRepoIds.size === 0
              ? sanitizeSetupScriptPromptDismissals(ui.setupScriptPromptDismissedRepoIds)
              : filterSetupScriptPromptDismissalsToValidRepos(
                  ui.setupScriptPromptDismissedRepoIds,
                  validRepoIds
                ),
          setupGuideSidebarDismissed: ui.setupGuideSidebarDismissed === true,
          setupGuideBrowserMilestoneMigrated: ui.setupGuideBrowserMilestoneMigrated === true,
          setupGuideBrowserMilestoneLegacyComplete:
            ui.setupGuideBrowserMilestoneLegacyComplete === true,
          browserImportHintHidden: ui.browserImportHintHidden === true,
          mobileEmulatorTabIntroDismissed: ui.mobileEmulatorTabIntroDismissed === true,
          mobileEmulatorAgentSetupDismissed: ui.mobileEmulatorAgentSetupDismissed === true,
          projectOrderManualDefaultNoticeDismissed:
            ui.projectOrderManualDefaultNoticeDismissed === true,
          // Why: load() resolves this for existing vs new profiles; treat only
          // explicit true as dismissed so a false from migration still surfaces.
          usagePercentageDisplayChangeNoticeDismissed:
            ui.usagePercentageDisplayChangeNoticeDismissed === true,
          // Why: default false when undefined so existing users still see the CTA;
          // only an explicit dismissal persists true.
          usageEmptyStateDismissed: ui.usageEmptyStateDismissed === true,
          // Why: restore visited-row acks alongside the persisted hook entries
          // they pair with. Stale acks for paneKeys whose tab/PTY no longer
          // exists are inert (no row references them); a paneKey reuse stamps a
          // fresh stateStartedAt that beats the old ack via the ackAt <
          // stateStartedAt comparison in WorktreeCardAgents. Sanitizer drops
          // entries past HYDRATE_MAX_AGE_MS so hard-quit/crash paths that miss
          // the in-session cleanup in agent-status.ts can't accumulate forever.
          acknowledgedAgentsByPaneKey: sanitizeAcknowledgedAgentsByPaneKey(
            ui.acknowledgedAgentsByPaneKey
          ),
          workspaceCleanupDismissals: sanitizeWorkspaceCleanupDismissals(
            ui.workspaceCleanup?.dismissals
          ),
          // Why: restore the view only from the startup hydration. Runtime UI
          // invalidations also hydrate with source 'sync'; re-applying activeView
          // there would yank the user's current
          // per-window view (navigation state, not a synced preference).
          activeView:
            source === 'startup' ? sanitizeHydratedActiveView(ui.activeView) : s.activeView,
          persistedUIReady: true
        }
        // Why: the runtime publishes UI written by any client. Identical hydration must
        // not create fresh references that App's debounced writer echoes to main.
        return hydratedUIPartialMatchesState(s, hydrated) ? s : hydrated
      })
    }
  }
}

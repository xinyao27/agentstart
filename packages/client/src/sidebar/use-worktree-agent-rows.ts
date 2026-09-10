import { useShallow } from 'zustand/react/shallow'
import { migrationUnsupportedToAgentStatusEntry } from '~renderer/agent/unsupported-entry-migration'
import { applyAgentRowLineage } from '~renderer/dashboard/agent-row-lineage'
import type { DashboardAgentRow } from '~renderer/dashboard/use-dashboard-data'
import { useNow } from '~renderer/dashboard/use-now'
import { useAppStore } from '~renderer/store/state'

import {
  createWorktreeAgentFreshnessSelector,
  EMPTY_WORKTREE_AGENT_FRESHNESS_SIGNATURE
} from './worktree-agent-freshness-selector'
import {
  selectLiveAgentStatusEntriesForWorktree,
  selectMigrationUnsupportedEntriesForWorktree,
  selectRuntimeAgentOrchestrationForWorktree,
  selectRetainedAgentEntriesForWorktree,
  selectTerminalLayoutsForWorktree
} from './worktree-agent-row-selectors'
import { buildWorktreeAgentRows } from './worktree-agent-rows'
import {
  selectLivePtyIdsForWorktree,
  selectRuntimePaneTitlesForWorktree
} from './worktree-card/status-inputs'

/**
 * Narrow per-worktree agent row hook used by the WorktreeCard inline agents
 * list. Produces live hook-reported agents plus retained "done" snapshots,
 * stale-decayed to 'idle' when the hook stream has gone quiet.
 *
 * Uses indexed per-worktree selectors rather than reusing useDashboardData's
 * cross-worktree aggregate. The index is rebuilt once per relevant immutable
 * store slice and then shared by every visible card, avoiding O(cards × agents)
 * selector work on high-frequency agent status pings.
 */
export function useWorktreeAgentRows(worktreeId: string, active = true): DashboardAgentRow[] {
  const selectAgentFreshness = (() => createWorktreeAgentFreshnessSelector(worktreeId))()
  const now = useNow(30_000)
  const tabs = useAppStore((s) => (active ? s.tabsByWorktree[worktreeId] : undefined))
  // Why: narrow the subscriptions to only THIS worktree's entries via
  // useShallow. Subscribing to the whole agentStatusByPaneKey map would make
  // every on-screen card re-render on any agent-status update anywhere —
  // O(worktrees²) render amplification. Pre-filtering here means the card
  // only re-renders when something relevant to THIS worktree changes.
  const liveEntries = useAppStore(
    useShallow((s) => (active ? selectLiveAgentStatusEntriesForWorktree(s, worktreeId) : []))
  )
  // Why: keep the store selector limited to stable raw records. Converting
  // migration entries creates fresh objects with Date.now(), which breaks
  // useSyncExternalStore's cached-snapshot contract and can blank the sidebar.
  const migrationUnsupported = useAppStore(
    useShallow((s) => (active ? selectMigrationUnsupportedEntriesForWorktree(s, worktreeId) : []))
  )
  const retained = useAppStore(
    useShallow((s) => (active ? selectRetainedAgentEntriesForWorktree(s, worktreeId) : []))
  )
  const runtimePaneTitlesByTabId = useAppStore(
    useShallow((s) => (active ? selectRuntimePaneTitlesForWorktree(s, worktreeId) : {}))
  )
  const ptyIdsByTabId = useAppStore(
    useShallow((s) => (active ? selectLivePtyIdsForWorktree(s, worktreeId) : {}))
  )
  const terminalLayoutsByTabId = useAppStore(
    useShallow((s) => (active ? selectTerminalLayoutsForWorktree(s, worktreeId) : {}))
  )
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    useShallow((s) => (active ? selectRuntimeAgentOrchestrationForWorktree(s, worktreeId) : {}))
  )
  // Why: freshness is time-sensitive external state; the subscription schedules
  // the render that recomputes age-based agent phases.
  useAppStore((s) => (active ? selectAgentFreshness(s) : EMPTY_WORKTREE_AGENT_FRESHNESS_SIGNATURE))

  return (() => {
    if (!active) {
      return []
    }
    const entries =
      migrationUnsupported.length > 0
        ? [
            ...liveEntries,
            ...migrationUnsupported.flatMap((unsupported) => {
              const entry = migrationUnsupportedToAgentStatusEntry(unsupported)
              return entry ? [entry] : []
            })
          ]
        : liveEntries
    return applyAgentRowLineage(
      buildWorktreeAgentRows({
        tabs: tabs ?? [],
        entries,
        retained,
        runtimePaneTitlesByTabId,
        ptyIdsByTabId,
        terminalLayoutsByTabId,
        runtimeAgentOrchestrationByPaneKey,
        now
      })
    )
  })()
}

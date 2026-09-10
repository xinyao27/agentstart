import type {
  AgentProviderSessionMetadata,
  ResumableTuiAgent,
  SleepingAgentLaunchConfig,
  SleepingAgentSessionRecord
} from '@agentstart/protocol/agent/session-resume'
import type {
  AgentStatusEntry,
  AgentStatusOrchestrationContext,
  AgentType,
  MigrationUnsupportedPtyEntry,
  ParsedAgentStatusPayload
} from '@agentstart/protocol/agent/status-records'
import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { createAgentStatusAuthorityActions } from './authority-actions'
import { createAgentStatusDropHibernatedActions } from './drop-hibernated-actions'
import { createAgentStatusDropPaneActions } from './drop-pane-actions'
import { createAgentStatusDropTabActions } from './drop-tab-actions'
import { createFreshnessScheduler } from './freshness-scheduler'
import { createAgentStatusLaunchActions } from './launch-actions'
import { createAgentStatusLiveActions } from './live-actions'
import { createAgentStatusRemovalActions } from './removal-actions'
import { createAgentStatusRetainedActions } from './retained-actions'
import { createAgentStatusSleepingActions } from './sleeping-actions'
import { createAgentStatusWorktreeCaptureActions } from './worktree-capture-actions'

export {
  collectHibernatedCompletionEvidenceForWorktree,
  collectSleepingAgentSessionRecordsForWorktree,
  removeSleepingRecordsReplacedByManualWorktreeSleep
} from './sleeping-model'
/** Snapshot of a finished (or vanished) agent status entry, kept around so
 *  the dashboard + sidebar hover can continue showing the completion until the
 *  user acknowledges it by clicking the worktree. The `worktreeId` is stamped
 *  at retention time so we know where the row belongs even after the tab/pty
 *  it came from has gone away. */
export type RetainedAgentEntry = {
  entry: AgentStatusEntry
  worktreeId: string
  /** Snapshot of the tab the agent lived in at retention time. We keep the
   *  full record (not just an id) because the tab may be gone from
   *  `tabsByWorktree` by the time the retained row is rendered. */
  tab: TerminalTab
  agentType: AgentType
  startedAt: number
}

export type AgentStatusWorktreeShutdownReason =
  | 'manual-sleep'
  | 'remove-worktree'
  | 'auto-hibernate-completed-agent'

type AllAgentSessionCaptureMode = 'periodic' | 'quit'

export type DropAgentStatusByWorktreeOptions = {
  shutdownReason?: AgentStatusWorktreeShutdownReason
  sleepingPaneKeys?: readonly string[] | ReadonlySet<string>
  retainedCompletionEvidence?: readonly RetainedAgentEntry[]
}

type DropHibernatedAgentPaneOptions = {
  retainedCompletionEvidence?: readonly RetainedAgentEntry[]
}

type DropAgentStatusByTabPrefixOptions = {
  worktreeId?: string
}

export type AgentLaunchConfigRegistrationMetadata = {
  agentType?: AgentType
  launchToken?: string
  tabId?: string
  leafId?: string
  terminalHandle?: string
  providerSession?: AgentProviderSessionMetadata
}

export type AgentLaunchConfigStatusMetadata = {
  paneKey: string
  agentType?: AgentType
  tabId?: string
  terminalHandle?: string
  launchToken?: string
  providerSession?: AgentProviderSessionMetadata
  existingProviderSession?: AgentProviderSessionMetadata
  providerSessionChanged?: boolean
}

export type AgentLaunchConfigRegistryEntry = {
  launchConfig: SleepingAgentLaunchConfig
  registeredAt: number
  identity: AgentLaunchConfigRegistrationMetadata
}

export type AgentStatusSlice = {
  /** Explicit agent status entries keyed by `${tabId}:${leafId}` composite.
   *  Real-time only — lives in renderer memory, not persisted to disk. */
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
  /** Main-synced dispatch metadata for live terminal panes that may only have
   *  title-derived status in the renderer. */
  runtimeAgentOrchestrationByPaneKey: Record<string, AgentStatusOrchestrationContext>
  /** PTYs that still report legacy numeric pane keys but have registry-backed
   *  UUID pane proof. Stored separately from normal hook-reported status. */
  migrationUnsupportedByPtyId: Record<string, MigrationUnsupportedPtyEntry>
  /** Monotonic tick that advances when agent-status freshness boundaries pass. */
  agentStatusEpoch: number
  /** Arm the shared freshness timer after an external mirror writes live rows. */
  scheduleAgentStatusFreshness: () => void

  /** Retained "done" entries — snapshots of agents that have disappeared from
   *  `agentStatusByPaneKey`. Keyed by paneKey so re-appearance of the same pane
   *  overwrites the snapshot. Shared between the dashboard and the sidebar
   *  agent-status hover so the two surfaces display identical rows. */
  retainedAgentsByPaneKey: Record<string, RetainedAgentEntry>

  /** Durable agent sessions captured when a workspace sleeps. These are not
   *  live status rows; they power the one-click CLI resume action on wake. */
  sleepingAgentSessionsByPaneKey: Record<string, SleepingAgentSessionRecord>

  /** Ephemeral launch snapshots keyed by concrete pane. Hook payloads do not
   *  carry AgentStart launch settings, so the renderer supplies them from startup. */
  agentLaunchConfigByPaneKey: Record<string, AgentLaunchConfigRegistryEntry>

  /** Pane keys explicitly torn down (pane close, tab close, PTY exit, manual
   *  dismissal) and therefore forbidden from being re-retained on their next
   *  disappearance. Consumed by the retention sync as a one-shot suppressor. */
  retentionSuppressedPaneKeys: Record<string, true>

  /** Terminal tabs explicitly closed in this renderer session. Used only to
   *  drop late in-flight IPC statuses and stale main-cache replays. */
  recentlyClosedAgentStatusTabIds: Record<string, true>

  /** Exact pane authorities retired while sibling panes in the tab stay live. */
  recentlyRetiredAgentStatusPaneKeys: Record<string, true>

  retireAgentPaneAuthority: (paneKey: string) => void
  transferAgentPaneAuthority: (args: {
    fromPaneKey: string
    toPaneKey: string
    ptyId?: string | null
  }) => void

  /** Update or insert an agent status entry from a status payload. */
  setAgentStatus: (
    paneKey: string,
    payload: ParsedAgentStatusPayload & {
      orchestration?: AgentStatusOrchestrationContext
      promptInteractionKey?: string
    },
    terminalTitle?: string,
    timing?: { updatedAt?: number; stateStartedAt?: number },
    routing?: {
      tabId?: string
      worktreeId?: string
      terminalHandle?: string
      connectionId?: string | null
    },
    metadata?: {
      providerSession?: AgentProviderSessionMetadata
      launchConfig?: SleepingAgentLaunchConfig
      launchToken?: string
    }
  ) => void

  /** Record durable resume identity without creating a visible turn row. */
  recordAgentProviderSession: (
    paneKey: string,
    agent: ResumableTuiAgent,
    providerSession: AgentProviderSessionMetadata,
    timing?: { updatedAt?: number },
    routing?: { tabId?: string; worktreeId?: string; connectionId?: string | null },
    metadata?: { launchToken?: string }
  ) => void

  registerAgentLaunchConfig: (
    paneKey: string,
    launchConfig: SleepingAgentLaunchConfig,
    metadata?: AgentLaunchConfigRegistrationMetadata
  ) => void
  getAgentLaunchConfigForStatusEntry: (
    entry: AgentStatusEntry
  ) => SleepingAgentLaunchConfig | undefined
  getAgentLaunchConfigForStatusMetadata: (
    metadata: AgentLaunchConfigStatusMetadata
  ) => SleepingAgentLaunchConfig | undefined
  clearAgentLaunchConfig: (paneKey: string) => void

  setRuntimeAgentOrchestrationByPaneKey: (
    entries: Record<string, AgentStatusOrchestrationContext>
  ) => void

  setMigrationUnsupportedPty: (entry: MigrationUnsupportedPtyEntry) => void
  clearMigrationUnsupportedPty: (ptyId: string) => void

  /** Remove a single entry (e.g., when a pane's terminal exits). */
  removeAgentStatus: (paneKey: string) => void

  /** Remove all entries whose paneKey starts with the given prefix.
   *  Used when a tab is closed — same prefix-sweep as cacheTimerByKey cleanup. */
  removeAgentStatusByTabPrefix: (tabIdPrefix: string) => void

  /** Remove a single entry AND suppress re-retention on its next disappearance.
   *  Used for USER-INITIATED teardown — the dashboard/hover X button, and
   *  pane close — where the user is telling us "I'm done with this row". */
  dropAgentStatus: (paneKey: string) => void

  /** Remove all entries under a tab AND suppress re-retention for each.
   *  Used on tab close — the user is tearing down the whole tab, so any
   *  remaining agent rows (live or retained) must not reappear. */
  dropAgentStatusByTabPrefix: (
    tabIdPrefix: string,
    opts?: DropAgentStatusByTabPrefixOptions
  ) => void

  /** Remove one automatically hibernated completed-agent pane while preserving
   *  sibling live/retained rows in the same worktree. */
  dropHibernatedAgentStatusPane: (
    worktreeId: string,
    paneKey: string,
    opts?: DropHibernatedAgentPaneOptions
  ) => void

  /** Remove all entries for a worktree AND suppress re-retention for live rows.
   *  Used on worktree sleep/remove — the whole worktree surface is folding, so
   *  retained rows must drop even if their original tab is no longer present.
   *
   *  Live entries are swept by tab prefix and by main-stamped worktree
   *  attribution so worker rows that arrive before their tab exists do not
   *  survive sleep/remove. */
  dropAgentStatusByWorktree: (worktreeId: string, opts?: DropAgentStatusByWorktreeOptions) => void

  captureSleepingAgentSessionsByWorktree: (worktreeId: string, paneKeys?: string[]) => void
  /** Capture resumable sessions for crash recovery or confirmed quit. */
  captureAllSleepingAgentSessions: (mode: AllAgentSessionCaptureMode) => void
  clearSleepingAgentSession: (paneKey: string) => void
  clearSleepingAgentSessionsByPaneKey: (paneKeys: readonly string[]) => void
  clearSleepingAgentSessionsByWorktree: (worktreeId: string) => void
  pruneSleepingAgentSessions: (validWorktreeIds: Set<string>) => void

  /** Retain agent snapshots (called by the top-level retention sync effect).
   *  Accepts an array so multiple agents disappearing in the same frame
   *  produce a single set(...) — avoids intermediate states visible
   *  mid-loop to consumers. */
  retainAgents: (entries: RetainedAgentEntry[]) => void

  /** Dismiss a retained entry by its paneKey. */
  dismissRetainedAgent: (paneKey: string) => void

  /** Dismiss all retained entries belonging to a worktree. */
  dismissRetainedAgentsByWorktree: (worktreeId: string) => void

  /** Prune retained entries whose worktreeId is not in the given set. */
  pruneRetainedAgents: (validWorktreeIds: Set<string>) => void

  /** Clear one-shot teardown suppressors after the retention sync observes
   *  that disappearance and decides not to retain the row. */
  clearRetentionSuppressedPaneKeys: (paneKeys: string[]) => void
}

// Why: retainedAgentsByPaneKey snapshots a completed agent (a full
// AgentStatusEntry — up to ~24KB of prompt/message text — plus a TerminalTab)
// per ephemeral paneKey. paneKeys never recur, and the map is pruned only on
// worktree removal or manual dismissal, so a long-lived worktree in a busy
// multi-agent session grows it without bound — the dominant driver of the
// renderer JS-heap OOM. Cap by insertion order (== retention order), evicting
// the oldest completions first so the newest — the ones a user is most likely
// to still care about — always survive. Evicted rows just stop showing in the
// recently-completed overlay.
export const createAgentStatusSlice: StateCreator<AppState, [], [], AgentStatusSlice> = (
  set,
  get
) => {
  // Why: the freshness scheduler is intentionally process-lifetime-scoped —
  // no dispose path — because it matches the store's own lifetime model
  // (the zustand store is a module-level singleton that lives until process
  // exit). Adding a teardown hook would require a store-dispose lifecycle
  // that does not exist anywhere else in the codebase.
  const freshness = createFreshnessScheduler({
    getEntries: () => Object.values(get().agentStatusByPaneKey),
    bumpEpochs: () => {
      // Why: freshness is time-based, not event-based. Advancing these epochs
      // at the exact stale boundary forces all freshness-aware selectors to
      // recompute — and re-sorts WorktreeList — even when no new PTY output
      // arrives. sortEpoch must bump in lockstep with agentStatusEpoch because
      // a stale transition can legitimately change worktree ordering.
      set((s) => ({
        agentStatusEpoch: s.agentStatusEpoch + 1,
        sortEpoch: s.sortEpoch + 1
      }))
    }
  })

  const clearSleepingAgentSessionsByPaneKey = (paneKeys: readonly string[]): void => {
    if (paneKeys.length === 0) {
      return
    }
    const uniquePaneKeys = new Set(paneKeys)
    set((s) => {
      let nextSleeping = s.sleepingAgentSessionsByPaneKey
      let nextLaunchConfigs = s.agentLaunchConfigByPaneKey
      for (const paneKey of uniquePaneKeys) {
        if (paneKey in nextSleeping) {
          if (nextSleeping === s.sleepingAgentSessionsByPaneKey) {
            nextSleeping = { ...nextSleeping }
          }
          delete nextSleeping[paneKey]
        }
        if (paneKey in nextLaunchConfigs) {
          if (nextLaunchConfigs === s.agentLaunchConfigByPaneKey) {
            nextLaunchConfigs = { ...nextLaunchConfigs }
          }
          delete nextLaunchConfigs[paneKey]
        }
      }
      if (
        nextSleeping === s.sleepingAgentSessionsByPaneKey &&
        nextLaunchConfigs === s.agentLaunchConfigByPaneKey
      ) {
        return s
      }
      return {
        sleepingAgentSessionsByPaneKey: nextSleeping,
        agentLaunchConfigByPaneKey: nextLaunchConfigs
      }
    })
  }

  return {
    agentStatusByPaneKey: {},
    runtimeAgentOrchestrationByPaneKey: {},
    migrationUnsupportedByPtyId: {},
    agentStatusEpoch: 0,
    retainedAgentsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: {},
    agentLaunchConfigByPaneKey: {},
    retentionSuppressedPaneKeys: {},
    recentlyClosedAgentStatusTabIds: {},
    recentlyRetiredAgentStatusPaneKeys: {},
    scheduleAgentStatusFreshness: () => freshness.schedule(),

    ...createAgentStatusAuthorityActions(set, get, () => freshness.schedule()),

    ...createAgentStatusLaunchActions(set, get, () => freshness.schedule()),

    ...createAgentStatusLiveActions(set, get, () => freshness.schedule()),

    ...createAgentStatusRemovalActions(set, get, () => freshness.schedule()),

    ...createAgentStatusDropPaneActions(set, get, () => freshness.schedule()),

    ...createAgentStatusDropTabActions(set, get, () => freshness.schedule()),

    ...createAgentStatusDropHibernatedActions(set, get, () => freshness.schedule()),

    ...createAgentStatusWorktreeCaptureActions(set, get, () => freshness.schedule()),

    clearSleepingAgentSession: (paneKey) => clearSleepingAgentSessionsByPaneKey([paneKey]),
    clearSleepingAgentSessionsByPaneKey,

    ...createAgentStatusSleepingActions(set, get),

    ...createAgentStatusRetainedActions(set, get)
  }
}

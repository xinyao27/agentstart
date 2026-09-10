import { agentPhaseFromStatus, type AgentPhase } from '@agentstart/protocol/agent/phase'
import { AGENT_STATUS_STALE_AFTER_MS } from '@agentstart/protocol/agent/status-records'
import { isExplicitAgentStatusFresh } from '~renderer/agent/status'
import { migrationUnsupportedToAgentStatusEntry } from '~renderer/agent/unsupported-entry-migration'
import {
  mergeAgentStatusOrchestration,
  resolveAgentStatusWorktreeId
} from '~renderer/sidebar/agent-status-worktree-attribution'
import type { AppState } from '~renderer/store/state'

export type WorktreeAgentActivitySummary = {
  agentPhase: AgentPhase | null
  hasRetainedComplete: boolean
}

const EMPTY_SUMMARY: WorktreeAgentActivitySummary = {
  agentPhase: null,
  hasRetainedComplete: false
}

const PHASE_PRIORITY: readonly AgentPhase[] = [
  'waiting-decision',
  'executing',
  'thinking',
  'complete'
]

type AgentActivityTabsByWorktree = Record<string, readonly { id: string }[]>

export type AgentActivityInput = Pick<
  AppState,
  | 'agentStatusEpoch'
  | 'agentStatusByPaneKey'
  | 'migrationUnsupportedByPtyId'
  | 'retainedAgentsByPaneKey'
> & {
  runtimeAgentOrchestrationByPaneKey?: AppState['runtimeAgentOrchestrationByPaneKey']
  tabsByWorktree: AgentActivityTabsByWorktree
}

type AgentActivityCache = {
  agentStatusEpoch: number
  migrationUnsupportedByPtyId: AppState['migrationUnsupportedByPtyId']
  retainedAgentsByPaneKey: AppState['retainedAgentsByPaneKey']
  runtimeAgentOrchestrationByPaneKey: AppState['runtimeAgentOrchestrationByPaneKey'] | undefined
  summaries: Map<string, WorktreeAgentActivitySummary>
  tabsByWorktree: AgentActivityTabsByWorktree
}

let agentActivityCache: AgentActivityCache | null = null

export function selectWorktreeAgentActivitySummary(
  state: AgentActivityInput,
  worktreeId: string
): WorktreeAgentActivitySummary {
  return getWorktreeAgentActivitySummaries(state).get(worktreeId) ?? EMPTY_SUMMARY
}

function getWorktreeAgentActivitySummaries(
  state: AgentActivityInput
): Map<string, WorktreeAgentActivitySummary> {
  const runtimeOrchestration = state.runtimeAgentOrchestrationByPaneKey
  if (
    agentActivityCache?.tabsByWorktree === state.tabsByWorktree &&
    agentActivityCache.agentStatusEpoch === state.agentStatusEpoch &&
    agentActivityCache.migrationUnsupportedByPtyId === state.migrationUnsupportedByPtyId &&
    agentActivityCache.retainedAgentsByPaneKey === state.retainedAgentsByPaneKey &&
    agentActivityCache.runtimeAgentOrchestrationByPaneKey === runtimeOrchestration
  ) {
    return agentActivityCache.summaries
  }

  const worktreeIdByTabId = new Map<string, string>()
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    for (const tab of tabs) {
      worktreeIdByTabId.set(tab.id, worktreeId)
    }
  }

  const phasesByWorktree = new Map<string, Set<AgentPhase>>()
  const retainedWorktrees = new Set<string>()
  const addPhase = (worktreeId: string, phase: AgentPhase): void => {
    const phases = phasesByWorktree.get(worktreeId) ?? new Set<AgentPhase>()
    phases.add(phase)
    phasesByWorktree.set(worktreeId, phases)
  }
  const now = Date.now()
  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    const orchestration = mergeAgentStatusOrchestration(
      entry,
      runtimeOrchestration?.[entry.paneKey]
    )
    const worktreeId = resolveAgentStatusWorktreeId(entry, worktreeIdByTabId, orchestration)
    if (worktreeId && isExplicitAgentStatusFresh(entry, now, AGENT_STATUS_STALE_AFTER_MS)) {
      addPhase(worktreeId, agentPhaseFromStatus(entry))
    }
  }

  for (const unsupported of Object.values(state.migrationUnsupportedByPtyId ?? {})) {
    const entry = migrationUnsupportedToAgentStatusEntry(unsupported)
    const worktreeId = entry
      ? resolveAgentStatusWorktreeId(entry, worktreeIdByTabId, entry.orchestration)
      : null
    if (worktreeId) {
      addPhase(worktreeId, 'waiting-decision')
    }
  }

  for (const retained of Object.values(state.retainedAgentsByPaneKey ?? {})) {
    retainedWorktrees.add(retained.worktreeId)
  }

  const worktreeIds = new Set([...phasesByWorktree.keys(), ...retainedWorktrees])
  const summaries = new Map<string, WorktreeAgentActivitySummary>()
  for (const worktreeId of worktreeIds) {
    const phases = phasesByWorktree.get(worktreeId)
    const summary = {
      agentPhase: PHASE_PRIORITY.find((phase) => phases?.has(phase)) ?? null,
      hasRetainedComplete: retainedWorktrees.has(worktreeId)
    }
    const previous = agentActivityCache?.summaries.get(worktreeId)
    summaries.set(worktreeId, previous && summariesEqual(previous, summary) ? previous : summary)
  }

  agentActivityCache = {
    agentStatusEpoch: state.agentStatusEpoch,
    migrationUnsupportedByPtyId: state.migrationUnsupportedByPtyId,
    retainedAgentsByPaneKey: state.retainedAgentsByPaneKey,
    runtimeAgentOrchestrationByPaneKey: runtimeOrchestration,
    summaries,
    tabsByWorktree: state.tabsByWorktree
  }
  return summaries
}

function summariesEqual(
  previous: WorktreeAgentActivitySummary,
  next: WorktreeAgentActivitySummary
): boolean {
  return (
    previous.agentPhase === next.agentPhase &&
    previous.hasRetainedComplete === next.hasRetainedComplete
  )
}

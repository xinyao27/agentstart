import { agentPhaseFromStatus, type AgentPhase } from '@yiru/protocol/agent/phase'
import type { AgentStatusEntry } from '@yiru/protocol/agent/status-records'
import { useAppStore } from '~renderer/store/state'

const PHASE_PRIORITY: readonly AgentPhase[] = [
  'waiting-decision',
  'executing',
  'thinking',
  'complete'
]

export type ActiveAgentPresence = {
  phase: AgentPhase
  projectId: string
  terminal: string | null
  title: string | null
  worktreeId: string
}

export type AgentPresenceSnapshot = {
  active: ActiveAgentPresence[]
  phase: AgentPhase | null
  waiting: ActiveAgentPresence[]
}

export function useAgentPresence(projectId?: string | null): AgentPresenceSnapshot {
  const entries = useAppStore((state) => state.agentStatusByPaneKey)
  return buildAgentPresence(Object.values(entries), projectId)
}

export function useWorktreeAgentPhase(worktreeId: string): AgentPhase | null {
  const entries = useAppStore((state) => state.agentStatusByPaneKey)
  const retained = useAppStore((state) => state.retainedAgentsByPaneKey)
  const phases = Object.values(entries).flatMap((entry) =>
    entry.worktreeId === worktreeId ? [agentPhaseFromStatus(entry)] : []
  )
  if (
    phases.length === 0 &&
    Object.values(retained).some((item) => item.worktreeId === worktreeId)
  ) {
    phases.push('complete')
  }
  return PHASE_PRIORITY.find((phase) => phases.includes(phase)) ?? null
}

function buildAgentPresence(
  entries: AgentStatusEntry[],
  projectId?: string | null
): AgentPresenceSnapshot {
  const matching = entries.flatMap((entry) => {
    if (!entry.worktreeId) {
      return []
    }
    const entryProjectId = projectIdFromWorktree(entry.worktreeId)
    if (projectId && entryProjectId !== projectId) {
      return []
    }
    return [
      {
        phase: agentPhaseFromStatus(entry),
        projectId: entryProjectId,
        terminal: entry.terminalHandle ?? null,
        title: entry.terminalTitle ?? null,
        worktreeId: entry.worktreeId
      }
    ]
  })
  const active = matching.filter((entry) => entry.phase !== 'complete')
  return {
    active,
    phase: PHASE_PRIORITY.find((phase) => matching.some((entry) => entry.phase === phase)) ?? null,
    waiting: matching.filter((entry) => entry.phase === 'waiting-decision')
  }
}

function projectIdFromWorktree(worktreeId: string): string {
  const separator = worktreeId.indexOf('::')
  return separator === -1 ? worktreeId : worktreeId.slice(0, separator)
}

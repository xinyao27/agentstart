import { agentPhaseFromStatus, type AgentPhase } from '@yiru/protocol/agent/phase'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusEntry
} from '@yiru/protocol/agent/status-records'
import { parseLegacyNumericPaneKey, parsePaneKey } from '@yiru/protocol/terminal/pane-identity'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import { isExplicitAgentStatusFresh } from '~renderer/agent/status'
import { resolveWorktreeStatus, type WorktreeStatus } from '~renderer/worktree/status'

export type TerminalTabActivityStatus = WorktreeStatus

const PHASE_PRIORITY: readonly AgentPhase[] = [
  'waiting-decision',
  'executing',
  'thinking',
  'complete'
]

type PhaseCache = {
  agentStatusByPaneKey: Record<string, AgentStatusEntry> | undefined
  agentStatusEpoch: number | undefined
  phasesByTabId: Map<string, AgentPhase>
}

let phaseCache: PhaseCache | null = null

function getTerminalTabPhases(
  agentStatusByPaneKey: Record<string, AgentStatusEntry> | undefined,
  agentStatusEpoch: number | undefined
): Map<string, AgentPhase> {
  const cached = phaseCache
  if (
    cached &&
    cached.agentStatusByPaneKey === agentStatusByPaneKey &&
    cached.agentStatusEpoch === agentStatusEpoch
  ) {
    return cached.phasesByTabId
  }

  const candidates = new Map<string, Set<AgentPhase>>()
  const now = Date.now()
  for (const [paneKey, entry] of Object.entries(agentStatusByPaneKey ?? {})) {
    if (!isExplicitAgentStatusFresh(entry, now, AGENT_STATUS_STALE_AFTER_MS)) {
      continue
    }
    const tabId = tabIdFromPaneKey(entry.paneKey || paneKey)
    if (!tabId) {
      continue
    }
    const phases = candidates.get(tabId) ?? new Set<AgentPhase>()
    phases.add(agentPhaseFromStatus(entry))
    candidates.set(tabId, phases)
  }

  const phasesByTabId = new Map<string, AgentPhase>()
  for (const [tabId, phases] of candidates) {
    const phase = PHASE_PRIORITY.find((candidate) => phases.has(candidate))
    if (phase) {
      phasesByTabId.set(tabId, phase)
    }
  }
  phaseCache = { agentStatusByPaneKey, agentStatusEpoch, phasesByTabId }
  return phasesByTabId
}

function tabIdFromPaneKey(paneKey: string): string | null {
  return parsePaneKey(paneKey)?.tabId ?? parseLegacyNumericPaneKey(paneKey)?.tabId ?? null
}

type TerminalTabActivityInput = {
  agentStatusByPaneKey?: Record<string, AgentStatusEntry>
  agentStatusEpoch?: number
  ptyIdsByTabId?: Record<string, string[]>
  tab: Pick<TerminalTab, 'id'>
}

export function resolveTerminalTabActivityStatus({
  agentStatusByPaneKey,
  agentStatusEpoch,
  ptyIdsByTabId,
  tab
}: TerminalTabActivityInput): TerminalTabActivityStatus {
  return resolveWorktreeStatus({
    agentPhase: getTerminalTabPhases(agentStatusByPaneKey, agentStatusEpoch).get(tab.id) ?? null,
    browserTabs: [],
    hasRetainedComplete: false,
    ptyIdsByTabId: ptyIdsByTabId ?? {},
    tabs: [tab]
  })
}

export function isTerminalTabActivityLive(status: TerminalTabActivityStatus): boolean {
  return status === 'thinking' || status === 'executing' || status === 'waiting-decision'
}

export function hasUnreadAgentCompletionForTerminalTab(
  unreadAgentCompletionPanes: Record<string, true> | undefined,
  tabId: string
): boolean {
  for (const paneKey of Object.keys(unreadAgentCompletionPanes ?? {})) {
    const separatorIndex = paneKey.indexOf(':')
    const owningTabId = separatorIndex === -1 ? paneKey : paneKey.slice(0, separatorIndex)
    if (owningTabId === tabId) {
      return true
    }
  }
  return false
}

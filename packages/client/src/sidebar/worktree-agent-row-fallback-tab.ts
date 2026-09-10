import type { AgentStatusEntry } from '@agentstart/protocol/agent/status-records'
import { parsePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'

export function effectiveWorktreeAgentRowStartedAt(entry: AgentStatusEntry): number {
  return entry.stateHistory[0]?.startedAt ?? entry.stateStartedAt
}

export function tabFromWorktreeAttributedStatusEntry(
  entry: AgentStatusEntry,
  effectiveStartedAt: number
): TerminalTab | null {
  const parsed = parsePaneKey(entry.paneKey)
  if (!parsed || !entry.worktreeId) {
    return null
  }
  return {
    id: parsed.tabId,
    ptyId: null,
    worktreeId: entry.worktreeId,
    title: entry.terminalTitle ?? 'Agent',
    customTitle: null,
    color: null,
    sortOrder: Number.MAX_SAFE_INTEGER,
    // Why: missing-tab rows must keep their original clock through real state
    // transitions; current stateStartedAt is a status timestamp, not tab order.
    createdAt: effectiveStartedAt
  }
}

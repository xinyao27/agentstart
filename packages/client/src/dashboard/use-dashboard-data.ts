import type {
  AgentStatusEntry,
  AgentStatusState,
  AgentType
} from '@yiru/protocol/agent/status-records'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'

// ─── Shared data types ────────────────────────────────────────────────────────

export type DashboardAgentRow = {
  /** Row identity. For 'subagent' rows this is a synthetic key (the child has
   *  no PTY) — unique for React/lineage maps but never parsed as a pane key. */
  paneKey: string
  entry: AgentStatusEntry
  tab: TerminalTab
  agentType: AgentType
  /** Where the row came from. 'title' rows are inferred from a live pane's
   *  terminal title and have no entry in agentStatusByPaneKey, so nothing
   *  about them is dismissible. */
  rowSource?: 'live' | 'retained' | 'subagent' | 'title'
  state: AgentStatusState | 'idle'
  /** Pane to focus when the row is activated, when it differs from paneKey.
   *  Subagent rows have no pane of their own and activate their parent's. */
  activationPaneKey?: string
  /** When this agent first began reporting status. Derived from the oldest
   *  stateHistory entry, falling back to updatedAt when no history exists yet.
   *  Used to sort agents by when they started. */
  startedAt: number
  lineage?: {
    depth: 0 | 1
    isFirstSibling: boolean
    isLastSibling: boolean
    childCount: number
  }
}

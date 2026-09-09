import type { AgentStatusStateValue as AgentStatusState } from '../agent-status-values.js'

export type AgentPhase = 'thinking' | 'executing' | 'waiting-decision' | 'complete'

export function agentPhaseFromStatus(status: {
  state: AgentStatusState
  toolName?: string
}): AgentPhase {
  switch (status.state) {
    case 'working':
      return status.toolName ? 'executing' : 'thinking'
    case 'blocked':
    case 'waiting':
      return 'waiting-decision'
    case 'done':
      return 'complete'
  }
}

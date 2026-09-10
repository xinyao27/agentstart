import { agentPhaseFromStatus } from '@agentstart/protocol/agent/phase'
import type { AgentDotState } from '~renderer/agent/status-dot'
import type { DashboardAgentRow as DashboardAgentRowData } from '~renderer/dashboard/use-dashboard-data'

function asDotState(agent: DashboardAgentRowData): AgentDotState {
  if (agent.state === 'idle') {
    return 'idle'
  }
  return agentPhaseFromStatus({ state: agent.state, toolName: agent.entry.toolName })
}

export function getAgentDotState(agent: DashboardAgentRowData): AgentDotState {
  return agent.entry.interrupted === true ? 'interrupted' : asDotState(agent)
}

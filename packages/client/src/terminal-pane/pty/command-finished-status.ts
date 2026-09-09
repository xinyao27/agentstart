import type { AgentStatusEntry } from '@yiru/protocol/agent/status-records'
import { useAppStore } from '~renderer/store/state'

export function dropCommandFinishedStatusIfSameTurn(
  paneKey: string,
  entry: AgentStatusEntry | undefined,
  options?: { allowInferredInterrupt?: boolean }
): void {
  const state = useAppStore.getState()
  if (!entry) {
    // Why: a Yiru-started agent can exit before its first hook status. The
    // launch registry was still created up front, so clear it on command exit.
    state.clearAgentLaunchConfig(paneKey)
    return
  }
  const current = state.agentStatusByPaneKey[paneKey]
  if (!current) {
    state.clearAgentLaunchConfig(paneKey)
    return
  }
  const isUnchanged =
    current.state === entry.state &&
    current.prompt === entry.prompt &&
    current.updatedAt === entry.updatedAt &&
    current.stateStartedAt === entry.stateStartedAt &&
    current.agentType === entry.agentType
  const isInferredFromEntry =
    options?.allowInferredInterrupt === true &&
    current.state === 'done' &&
    current.interrupted === true &&
    current.prompt === entry.prompt &&
    current.agentType === entry.agentType &&
    current.stateHistory?.some(
      (history) =>
        history.state === entry.state &&
        history.prompt === entry.prompt &&
        history.startedAt === entry.stateStartedAt
    ) === true
  if (isUnchanged || isInferredFromEntry) {
    state.dropAgentStatus(paneKey)
  }
}

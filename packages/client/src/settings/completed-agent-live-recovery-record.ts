import {
  agentProviderSessionsEqual,
  getAgentResumeArgv,
  isResumableTuiAgent,
  type SleepingAgentSessionRecord
} from '@yiru/protocol/agent/session-resume'
import type { AgentStatusEntry } from '@yiru/protocol/agent/status-records'

export function isCompletedAgentWithLiveRecoveryRecord(
  entry: AgentStatusEntry | undefined,
  record: SleepingAgentSessionRecord | undefined,
  worktreeId?: string
): record is SleepingAgentSessionRecord {
  const agent = entry?.agentType
  if (
    entry?.state !== 'done' ||
    !isResumableTuiAgent(agent) ||
    !entry.providerSession ||
    record?.agent !== agent ||
    record.origin !== 'live'
  ) {
    return false
  }
  return Boolean(
    (!entry.worktreeId || entry.worktreeId === record.worktreeId) &&
    (!worktreeId || worktreeId === record.worktreeId) &&
    agentProviderSessionsEqual(agent, entry.providerSession, record.providerSession) &&
    getAgentResumeArgv(agent, record.providerSession, record.launchConfig?.ompResumeFilePath)
  )
}

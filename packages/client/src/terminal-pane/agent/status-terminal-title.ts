import type { ParsedAgentStatusPayload } from '@yiru/protocol/agent/status-records'
import {
  getSyntheticAgentTerminalTitle,
  getSyntheticAgentTitleProfile
} from '~renderer/agent/title/synthetic'
import { classifyTitleActivity } from '~renderer/terminal-pane/agent/evidence'

export function resolveAgentStatusTerminalTitle(
  payload: Pick<ParsedAgentStatusPayload, 'agentType' | 'state'>,
  currentTitle: string | undefined
): string | undefined {
  const syntheticTitle = getSyntheticAgentTerminalTitle(payload.agentType, payload.state)
  if (!syntheticTitle) {
    return currentTitle
  }
  if (shouldReplaceCurrentTitle(payload, currentTitle)) {
    return syntheticTitle
  }
  return currentTitle
}

function shouldReplaceCurrentTitle(
  payload: Pick<ParsedAgentStatusPayload, 'agentType' | 'state'>,
  currentTitle: string | undefined
): boolean {
  if (!currentTitle?.trim()) {
    return true
  }
  const currentStatus = classifyTitleActivity(currentTitle)
  if (currentStatus === 'working') {
    return true
  }
  if (payload.state === 'done' && currentStatus === 'permission') {
    return true
  }
  const profile = getSyntheticAgentTitleProfile(payload.agentType)
  if (!profile) {
    return false
  }
  // Why: cursor-agent can report the bare native title at completion; the
  // detector treats that as a no-op, so explicit status needs the idle label.
  if (currentTitle.trim().toLowerCase() === profile.workingLabel.toLowerCase()) {
    return true
  }
  return payload.state === 'blocked' || payload.state === 'waiting'
}

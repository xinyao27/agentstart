import type { AgentType } from '@agentstart/protocol/agent/status-records'

type CommandCodeTurnBoundaryInput = {
  agentType: AgentType | undefined
  previousState?: string
  incomingState: string
  previousPrompt?: string
  incomingPrompt: string
  hasExplicitPrompt?: boolean
  previousPromptInteractionKey?: string
  incomingPromptInteractionKey?: string
}

/** Command Code has no UserPromptSubmit hook; a new transcript prompt is the turn boundary. */
export function isCommandCodeNewTurnWhileWorking({
  agentType,
  previousState,
  incomingState,
  previousPrompt,
  incomingPrompt,
  hasExplicitPrompt,
  previousPromptInteractionKey,
  incomingPromptInteractionKey
}: CommandCodeTurnBoundaryInput): boolean {
  if (agentType !== 'command-code') {
    return false
  }
  if (previousState !== 'working' || incomingState !== 'working') {
    return false
  }

  const nextPrompt = incomingPrompt.trim()
  if (nextPrompt.length === 0) {
    return false
  }

  if (
    incomingPromptInteractionKey !== undefined &&
    previousPromptInteractionKey !== undefined &&
    incomingPromptInteractionKey !== previousPromptInteractionKey
  ) {
    return true
  }

  if (nextPrompt === (previousPrompt ?? '').trim()) {
    return false
  }

  // Why: callers with explicit prompt provenance can reject incidental transcript changes.
  if (hasExplicitPrompt === false) {
    return false
  }

  return true
}

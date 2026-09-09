import type { AgentStatusEntry, AgentType } from '@yiru/protocol/agent/status-records'
import { resolveCompatibleAgentTypeForOwner } from '~renderer/agent/title/owner'
import { isClaudeAgent } from '~renderer/agent/title/provider'
import { detectAgentStatusFromTitle } from '~renderer/agent/title/status'
import { useAppStore } from '~renderer/store/state'

import type { AgentCompletionStatusSnapshot } from '../agent/completion-coordinator-types'
import { resolveCommittedTitleAgentType } from '../agent/evidence'
import { registerAgentHookTerminalLifecycleHandler } from '../agent/hook-terminal-lifecycle'

type TitleCompletionSideEffectsOptions = {
  paneKey: string
  setCacheTimerStartedAt: (timestamp: number) => void
  setFocusReportSuppression: (title: string, agentType: AgentType | undefined) => void
  clearFocusReportSuppression: () => void
  queueIdleTerminalModeReset: () => void
}

export type TitleCompletionSideEffects = {
  shouldSuppressForFreshHook: (title: string, status: AgentStatusEntry | undefined) => boolean
  apply: (title: string, agentType: AgentType | undefined) => void
  preserve: (title: string, status: AgentStatusEntry) => void
  clear: () => void
  dispose: () => void
}

export function createTitleCompletionSideEffects(
  options: TitleCompletionSideEffectsOptions
): TitleCompletionSideEffects {
  let pending: { title: string; agentType: AgentType | undefined } | null = null
  const clear = (): void => {
    pending = null
  }
  const apply = (title: string, agentType: AgentType | undefined): void => {
    const settings = useAppStore.getState().settings
    if (
      (agentType === 'claude' || isClaudeAgent(title)) &&
      (settings === null || settings.promptCacheTimerEnabled)
    ) {
      options.setCacheTimerStartedAt(Date.now())
    }
    options.setFocusReportSuppression(title, agentType)
    options.queueIdleTerminalModeReset()
  }
  const handleHookLifecycle = (payload: AgentCompletionStatusSnapshot): void => {
    if (!pending) {
      return
    }
    const payloadAgent = resolveCompatibleAgentTypeForOwner(payload.agentType, pending.agentType)
    const belongsToPendingAgent =
      !pending.agentType ||
      pending.agentType === 'unknown' ||
      !payload.agentType ||
      payload.agentType === 'unknown' ||
      payloadAgent === pending.agentType
    if (!belongsToPendingAgent || payload.state === 'working') {
      clear()
    } else if (payload.state === 'done') {
      apply(pending.title, payload.agentType ?? pending.agentType)
      clear()
    } else if (payload.state === 'waiting' || payload.state === 'blocked') {
      options.clearFocusReportSuppression()
      options.queueIdleTerminalModeReset()
    }
  }
  const dispose = registerAgentHookTerminalLifecycleHandler(options.paneKey, handleHookLifecycle)

  return {
    shouldSuppressForFreshHook: (title, status) => {
      if (detectAgentStatusFromTitle(title) === 'working' || !status) {
        return false
      }
      const titleAgent = resolveCommittedTitleAgentType(title)
      const hookAgent = resolveCompatibleAgentTypeForOwner(status.agentType, titleAgent)
      const namesDifferentKnownAgent =
        titleAgent && status.agentType && status.agentType !== 'unknown' && hookAgent !== titleAgent
      return !namesDifferentKnownAgent
    },
    apply,
    preserve: (title, status) => {
      pending = { title, agentType: status.agentType }
      if (status.state === 'waiting' || status.state === 'blocked') {
        options.clearFocusReportSuppression()
        options.queueIdleTerminalModeReset()
      }
    },
    clear,
    dispose
  }
}

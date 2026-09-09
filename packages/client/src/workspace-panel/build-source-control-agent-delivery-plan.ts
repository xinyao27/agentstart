import type { TuiAgent } from '@yiru/protocol/agent/types'
import { useAppStore } from '~renderer/store/state'

import type { SourceControlAgentActionDeliveryPlanState } from './source-control/agent-action-dialog-form'
import { buildSourceControlAgentConnectionErrorPlan } from './source-control/agent-action-dialog-support'
import { planSourceControlAgentActionLaunch } from './source-control/agent-action-plan'

type BuildSourceControlAgentDeliveryPlanArgs = {
  selectedAgent: TuiAgent | null
  commandInput: string
  agentArgs: string
  promptDelivery: 'auto-submit' | 'draft' | 'submit-after-ready'
  detectedAgents: TuiAgent[]
  connectionUnavailable: boolean
  launchPlatform?: NodeJS.Platform
  /** Why: keep the previewed command label in sync with the relay command. */
  isRemote?: boolean
}

export function buildSourceControlAgentDeliveryPlan({
  selectedAgent,
  commandInput,
  agentArgs,
  promptDelivery,
  detectedAgents,
  connectionUnavailable,
  launchPlatform,
  isRemote
}: BuildSourceControlAgentDeliveryPlanArgs): SourceControlAgentActionDeliveryPlanState {
  if (connectionUnavailable) {
    return buildSourceControlAgentConnectionErrorPlan()
  }
  const result = planSourceControlAgentActionLaunch({
    agent: selectedAgent,
    commandInput,
    agentArgs,
    promptDelivery,
    detectedAgents,
    disabledAgents: useAppStore.getState().settings?.disabledTuiAgents,
    cmdOverrides: useAppStore.getState().settings?.agentCmdOverrides,
    terminalWindowsShell: useAppStore.getState().settings?.terminalWindowsShell,
    platform: launchPlatform,
    isRemote
  })
  if (!result.ok) {
    return { status: 'error', error: result.error }
  }
  return {
    status: 'success',
    summary: result.summary,
    commandLabel: result.commandLabel,
    caveat: result.caveat
  }
}

import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type {
  SourceControlActionRecipe,
  SourceControlLaunchActionId
} from '@agentstart/protocol/source-control/ai-actions'
import type { LaunchSource } from '@agentstart/protocol/telemetry/events/foundations'
import { useRef, useState } from 'react'
import type { SourceControlAiWriteTarget } from '~renderer/source-control/ai-recipe-save'

import { buildSourceControlAgentDeliveryPlan } from '../build-source-control-agent-delivery-plan'
import { runSourceControlAgentActionStart } from '../run-source-control-agent-action-start'
import type { SourceControlAgentActionDeliveryPlanState } from './agent-action-dialog-form'
import { buildSourceControlAgentConnectionErrorPlan } from './agent-action-dialog-support'

type UseSourceControlAgentActionStartArgs = {
  selectedAgent: TuiAgent | null
  commandInput: string
  trimmedCommandInput: string
  agentArgs: string
  commandTemplate: string
  saveLaunchRecipe: boolean
  saveTargetValue: string
  actionId: SourceControlLaunchActionId
  repoId?: string | null
  settings: GlobalSettings | null
  repo: Pick<Repo, 'id' | 'sourceControlAi'> | null
  worktreeId?: string | null
  groupId?: string | null
  promptDelivery: 'auto-submit' | 'draft' | 'submit-after-ready'
  launchPlatform?: NodeJS.Platform
  /** Why: SSH hosts must preview the relay's public CLI command. */
  isRemote?: boolean
  launchSource: LaunchSource
  connectionUnavailable: boolean
  refreshDetectedAgents: () => Promise<TuiAgent[]>
  onStart?: (args: {
    agent: TuiAgent
    commandInput: string
    agentArgs: string
  }) => boolean | Promise<boolean>
  onSaveAgentDefault?: (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe
  ) => void | Promise<void>
  onLaunched?: () => void
  onClose: () => void
}

type SourceControlAgentActionStartWithDetectedAgentsArgs = {
  detectedAgents: TuiAgent[]
  saveTargetValueOverride?: string
}

type UseSourceControlAgentActionStartResult = {
  deliveryPlan: SourceControlAgentActionDeliveryPlanState
  resetDeliveryPlan: () => void
  isStarting: boolean
  handleStart: () => Promise<void>
  startWithDetectedAgents: (
    args: SourceControlAgentActionStartWithDetectedAgentsArgs
  ) => Promise<boolean>
}

export function useSourceControlAgentActionStart({
  selectedAgent,
  commandInput,
  trimmedCommandInput,
  agentArgs,
  commandTemplate,
  saveLaunchRecipe,
  saveTargetValue,
  actionId,
  repoId,
  settings,
  repo,
  worktreeId,
  groupId,
  promptDelivery,
  launchPlatform,
  isRemote,
  launchSource,
  connectionUnavailable,
  refreshDetectedAgents,
  onStart,
  onSaveAgentDefault,
  onLaunched,
  onClose
}: UseSourceControlAgentActionStartArgs): UseSourceControlAgentActionStartResult {
  const [deliveryPlan, setDeliveryPlan] = useState<SourceControlAgentActionDeliveryPlanState>({
    status: 'idle'
  })
  const [isStarting, setIsStarting] = useState(false)
  const isStartingRef = useRef(false)
  const resetDeliveryPlan = () => setDeliveryPlan({ status: 'idle' })

  const buildPlan = async (
    agentsOverride?: TuiAgent[]
  ): Promise<SourceControlAgentActionDeliveryPlanState> => {
    const currentDetectedAgents = agentsOverride ?? (await refreshDetectedAgents())
    return buildSourceControlAgentDeliveryPlan({
      selectedAgent,
      commandInput,
      agentArgs,
      promptDelivery,
      detectedAgents: currentDetectedAgents,
      connectionUnavailable,
      launchPlatform,
      isRemote
    })
  }

  const startWithDetectedAgents = async ({
    detectedAgents: nextAgents,
    saveTargetValueOverride
  }: SourceControlAgentActionStartWithDetectedAgentsArgs): Promise<boolean> => {
    if (!selectedAgent || isStartingRef.current) {
      return false
    }
    if (connectionUnavailable) {
      setDeliveryPlan(buildSourceControlAgentConnectionErrorPlan())
      return false
    }
    isStartingRef.current = true
    setIsStarting(true)
    try {
      const nextPlan = await buildPlan(nextAgents)
      if (nextPlan.status === 'error') {
        setDeliveryPlan(nextPlan)
        return false
      }
      setDeliveryPlan(nextPlan)
      return await runSourceControlAgentActionStart({
        selectedAgent,
        trimmedCommandInput,
        agentArgs,
        commandTemplate,
        saveTargetValue: saveLaunchRecipe ? (saveTargetValueOverride ?? saveTargetValue) : 'none',
        actionId,
        repoId,
        settings,
        repo,
        worktreeId,
        groupId,
        promptDelivery,
        launchPlatform,
        launchSource,
        onStart,
        onSaveAgentDefault,
        onLaunched,
        onClose: () => {
          resetDeliveryPlan()
          onClose()
        }
      })
    } finally {
      isStartingRef.current = false
      setIsStarting(false)
    }
  }

  const handleStart = async () => {
    if (!selectedAgent || isStartingRef.current) {
      return
    }
    // Why: manual starts intentionally re-check the current host, while the
    // saved-receipt bypass reuses the detection result that unlocked it.
    const nextAgents = await refreshDetectedAgents()
    await startWithDetectedAgents({ detectedAgents: nextAgents })
  }

  return { deliveryPlan, resetDeliveryPlan, isStarting, handleStart, startWithDetectedAgents }
}

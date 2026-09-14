import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { getAgentCatalog } from '~renderer/agent/catalog'
import type { useRepoById } from '~renderer/store/selectors'
import type { useAppStore } from '~renderer/store/state'

import type { SourceControlAgentActionDeliveryPlanState } from './agent-action-dialog-form'

export type SourceControlAgentScopeNote = {
  effectiveAgentLabel: string
  globalAgentLabel: string
}

export type UseSourceControlAgentActionDialogResult = {
  handleOpenChange: (nextOpen: boolean) => void
  shouldRenderDialog: boolean
  agentScopeNote: SourceControlAgentScopeNote | null
  agentOptions: ReturnType<typeof getAgentCatalog>
  selectedAgent: TuiAgent | null
  hasEnabledAgents: boolean
  detecting: boolean
  statusCopy: string | null
  agentArgs: string
  commandTemplate: string
  saveLaunchRecipe: boolean
  saveTargetValue: string
  saveTargets: { value: string; label: string }[]
  settings: ReturnType<typeof useAppStore.getState>['settings']
  repo: ReturnType<typeof useRepoById>
  deliveryPlan: SourceControlAgentActionDeliveryPlanState
  canStart: boolean
  isStarting: boolean
  onSelectedAgentChange: (agent: TuiAgent | null) => void
  onAgentArgsChange: (value: string) => void
  onCommandTemplateChange: (value: string) => void
  onSaveLaunchRecipeChange: (value: boolean) => void
  onSaveAgentDefaultChange: (value: string) => void
  handleStart: () => Promise<void>
}

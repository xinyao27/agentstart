import { isTuiAgentEnabled } from '@agentstart/protocol/agent/selection'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { getAgentCatalog } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import type { SourceControlLaunchAgentScope } from '~renderer/source-control/agent-selection'
import type { SourceControlAiWriteTarget } from '~renderer/source-control/ai-recipe-save'

import type { SourceControlAgentActionDeliveryPlanState } from './agent-action-dialog-form'

export function isSourceControlAgentDetectedAndEnabled(
  agent: TuiAgent | null,
  detectedAgents: TuiAgent[],
  disabledAgents: TuiAgent[] | undefined
): boolean {
  return Boolean(
    agent && detectedAgents.includes(agent) && isTuiAgentEnabled(agent, disabledAgents)
  )
}

export function buildSourceControlAgentSaveTargets(repoId?: string | null): {
  value: string
  label: string
}[] {
  const targets = [
    {
      value: 'none',
      label: translate(
        'auto.components.right.sidebar.SourceControlAgentActionDialog.994cddd1f7',
        "Don't save"
      )
    }
  ]
  if (repoId) {
    targets.push({
      value: 'repo',
      label: translate(
        'auto.components.right.sidebar.SourceControlAgentActionDialog.808cfe0a3b',
        'This repository'
      )
    })
  }
  targets.push({
    value: 'global',
    label: translate(
      'auto.components.right.sidebar.SourceControlAgentActionDialog.38b899cc02',
      'All repositories'
    )
  })
  return targets
}

export function buildSourceControlAgentConnectionErrorPlan(): SourceControlAgentActionDeliveryPlanState {
  return {
    status: 'error',
    error: translate(
      'auto.components.right.sidebar.SourceControlAgentActionDialog.c075d00de1',
      'Unable to resolve the workspace connection.'
    )
  }
}

export function resolveSourceControlAgentSaveTarget(
  saveTargetValue: string,
  repoId?: string | null
): SourceControlAiWriteTarget | null {
  if (saveTargetValue === 'repo' && repoId) {
    return { type: 'repo', repoId }
  }
  if (saveTargetValue === 'global') {
    return { type: 'global' }
  }
  return null
}

// Why: identifies a dialog "session" — a reopen or a change of the target it
// acts on (repo, connection, saved recipe, disabled agents) — so the hook can
// resync its editable fields during render instead of resetting them from an
// effect keyed on `open` alone.
export function buildSourceControlAgentOpenSessionKey(args: {
  open: boolean
  repoId?: string | null
  connectionId?: string | null
  worktreeId?: string | null
  savedAgentId?: TuiAgent | null
  savedCommandInputTemplate?: string | null
  savedAgentArgs?: string | null
  defaultSaveTargetValue: string
  defaultTuiAgent?: TuiAgent | 'blank' | null
  disabledAgents: TuiAgent[] | undefined
}): string | null {
  if (!args.open) {
    return null
  }
  return JSON.stringify([
    args.repoId ?? null,
    args.connectionId ?? null,
    args.worktreeId ?? null,
    args.savedAgentId ?? null,
    args.savedCommandInputTemplate ?? null,
    args.savedAgentArgs ?? null,
    args.defaultSaveTargetValue,
    args.defaultTuiAgent ?? null,
    args.disabledAgents ?? null
  ])
}

export function buildSourceControlAgentScopeNote(
  scope: SourceControlLaunchAgentScope
): { effectiveAgentLabel: string; globalAgentLabel: string } | null {
  if (!scope.overridesGlobalAgent) {
    return null
  }
  const catalog = getAgentCatalog()
  const labelFor = (agentId: TuiAgent | null): string =>
    catalog.find((entry) => entry.id === agentId)?.label ?? agentId ?? ''
  return {
    effectiveAgentLabel: labelFor(scope.effectiveAgentId),
    globalAgentLabel: labelFor(scope.globalAgentId)
  }
}

export function buildSourceControlAgentStatusCopy(args: {
  selectedAgent: TuiAgent | null
  selectedAgentUnavailable: boolean
  connectionUnavailable: boolean
  hasEnabledAgents: boolean
  detecting: boolean
}): string | null {
  const {
    selectedAgent,
    selectedAgentUnavailable,
    connectionUnavailable,
    hasEnabledAgents,
    detecting
  } = args
  if (selectedAgentUnavailable) {
    return `${getAgentCatalog().find((entry) => entry.id === selectedAgent)?.label ?? selectedAgent} is not enabled or was not detected on this workspace host.`
  }
  if (connectionUnavailable) {
    return 'Unable to resolve the workspace connection.'
  }
  if (!hasEnabledAgents && !detecting) {
    return 'No enabled agents were detected on this workspace host.'
  }
  return null
}

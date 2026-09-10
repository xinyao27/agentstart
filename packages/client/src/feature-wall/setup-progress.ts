import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { FeatureWallSetupStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { FeatureInteractionState } from '@agentstart/protocol/telemetry/interactions/state'
import { hasFeatureInteraction } from '@agentstart/protocol/telemetry/interactions/state'
import type { Worktree } from '@agentstart/protocol/worktree/model'

import { getFeatureWallSetupSteps } from './content/setup-steps'

export type FeatureWallSetupProgressInput = {
  ready?: boolean
  settings: GlobalSettings | null
  featureInteractions: FeatureInteractionState
  browserUseSkillInstalled: boolean
  computerUseSkillInstalled: boolean
  computerUsePermissionsReady: boolean
  computerUseUnavailable?: boolean
  orchestrationSkillInstalled: boolean
  gitRepoCount: number
  worktreesByRepo: Record<string, Worktree[]>
  hasSetupScript: boolean
}

export type FeatureWallSetupProgress = {
  ready: boolean
  stepDone: Record<FeatureWallSetupStepId, boolean>
  coreDoneCount: number
  coreTotal: number
}

function countAvailableNonMainWorktrees(worktreesByRepo: Record<string, Worktree[]>): number {
  // Why: imported git worktrees count as real parallel-work capacity, but
  // partially hydrated placeholders can appear before a worktree path is known.
  return Object.values(worktreesByRepo).reduce(
    (sum, worktrees) =>
      sum +
      worktrees.filter(
        (worktree) => !worktree.isMainWorktree && typeof worktree.path === 'string' && worktree.path
      ).length,
    0
  )
}

export function getFeatureWallSetupProgress(
  input: FeatureWallSetupProgressInput
): FeatureWallSetupProgress {
  const agentCapabilitiesDone =
    input.browserUseSkillInstalled &&
    input.computerUseSkillInstalled &&
    (input.computerUsePermissionsReady || input.computerUseUnavailable === true) &&
    input.orchestrationSkillInstalled
  const stepDone: Record<FeatureWallSetupStepId, boolean> = {
    'default-agent':
      Boolean(input.settings?.defaultTuiAgent) && input.settings?.defaultTuiAgent !== 'blank',
    'add-two-repos': input.gitRepoCount >= 2,
    notifications:
      input.settings?.notifications.enabled === true &&
      input.settings.notifications.agentTaskComplete === true,
    'two-worktrees': countAvailableNonMainWorktrees(input.worktreesByRepo) >= 1,
    // Why: the 'browser' interaction fires when a non-blank page is viewed, so
    // opening any real page in AgentStart's browser durably completes this milestone.
    browser: hasFeatureInteraction(input.featureInteractions, 'browser'),
    'agent-capabilities': agentCapabilitiesDone,
    'setup-script': input.hasSetupScript
  }
  return {
    ready: input.ready ?? true,
    stepDone,
    coreDoneCount: getFeatureWallSetupSteps().filter((step) => stepDone[step.id]).length,
    coreTotal: getFeatureWallSetupSteps().length
  }
}

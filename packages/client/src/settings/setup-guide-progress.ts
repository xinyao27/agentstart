import type { FeatureWallSetupStepId } from '@yiru/protocol/telemetry/feature-wall/types'

import {
  getFeatureWallSetupSteps,
  getFirstIncompleteFeatureWallSetupStepId
} from '../feature-wall/content/setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/setup-progress'
import { useSetupGuideProgress } from '../setup-guide/use-setup-guide-progress'

export type SettingsSetupGuideProgress = {
  ready: boolean
  doneCount: number
  total: number
  firstIncompleteStepId: FeatureWallSetupStepId | null
}

export function getSettingsSetupGuideProgress(progress: {
  ready: boolean
  stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>
}): SettingsSetupGuideProgress {
  const doneCount = getFeatureWallSetupSteps().filter((step) => progress.stepDone[step.id]).length
  const firstIncompleteStepId =
    doneCount === getFeatureWallSetupSteps().length
      ? null
      : getFirstIncompleteFeatureWallSetupStepId(progress.stepDone)

  return {
    ready: progress.ready,
    doneCount,
    total: getFeatureWallSetupSteps().length,
    firstIncompleteStepId
  }
}

export function useSettingsSetupGuideProgress(
  shouldRefreshCoreState: boolean
): SettingsSetupGuideProgress {
  const fullProgress = useSettingsSetupGuideFullProgress(shouldRefreshCoreState, false, false)

  return (() => getSettingsSetupGuideProgress(fullProgress))()
}

export function useSettingsSetupGuideFullProgress(
  shouldRefreshCoreState: boolean,
  orchestrationSkillInstalled: boolean,
  browserUseSkillInstalled: boolean
): FeatureWallSetupProgress {
  return useSetupGuideProgress(
    shouldRefreshCoreState,
    orchestrationSkillInstalled,
    browserUseSkillInstalled
  )
}

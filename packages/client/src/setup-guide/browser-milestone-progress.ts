import type { FeatureWallSetupStepId } from '@yiru/protocol/telemetry/feature-wall/types'
import { useEffect } from 'react'
import { useAppStore } from '~renderer/store/state'

import { getFeatureWallSetupSteps } from '../feature-wall/content/setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/setup-progress'

export function useSetupGuideBrowserMilestoneProgress(
  rawProgress: FeatureWallSetupProgress,
  historicalSplitTerminalDone: boolean
): FeatureWallSetupProgress {
  const setupGuideSidebarDismissed = useAppStore((s) => s.setupGuideSidebarDismissed)
  const browserMilestoneMigrated = useAppStore((s) => s.setupGuideBrowserMilestoneMigrated)
  const browserMilestoneLegacyComplete = useAppStore(
    (s) => s.setupGuideBrowserMilestoneLegacyComplete
  )
  const markBrowserMilestoneMigrated = useAppStore((s) => s.markSetupGuideBrowserMilestoneMigrated)
  const pendingLegacyComplete =
    !browserMilestoneMigrated && rawProgress.ready
      ? shouldMarkBrowserMilestoneLegacyComplete({
          stepDone: rawProgress.stepDone,
          historicalSplitTerminalDone,
          setupGuideSidebarDismissed
        })
      : false
  const effectiveLegacyComplete = browserMilestoneLegacyComplete || pendingLegacyComplete

  useEffect(() => {
    if (browserMilestoneMigrated || !rawProgress.ready) {
      return
    }
    markBrowserMilestoneMigrated(pendingLegacyComplete)
  }, [
    browserMilestoneMigrated,
    markBrowserMilestoneMigrated,
    pendingLegacyComplete,
    rawProgress.ready
  ])

  return (() => getSetupGuideBrowserMilestoneAwareProgress(rawProgress, effectiveLegacyComplete))()
}

export function shouldMarkBrowserMilestoneLegacyComplete(input: {
  stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>
  historicalSplitTerminalDone: boolean
  setupGuideSidebarDismissed: boolean
}): boolean {
  if (input.setupGuideSidebarDismissed) {
    return true
  }
  // Why: browser migration preserves the old pre-browser checklist, which
  // included the now-removed split-terminal milestone.
  return (
    input.historicalSplitTerminalDone &&
    getFeatureWallSetupSteps().every((step) => step.id === 'browser' || input.stepDone[step.id])
  )
}

export function getSetupGuideBrowserMilestoneAwareProgress(
  progress: FeatureWallSetupProgress,
  browserMilestoneLegacyComplete: boolean
): FeatureWallSetupProgress {
  if (!browserMilestoneLegacyComplete) {
    return progress
  }
  const stepDone = Object.fromEntries(
    getFeatureWallSetupSteps().map((step) => [step.id, true])
  ) as Record<FeatureWallSetupStepId, boolean>
  // Why: profiles that finished or dismissed the pre-browser checklist keep
  // that prior checklist contract after the browser milestone is introduced.
  return {
    ...progress,
    stepDone,
    coreDoneCount: getFeatureWallSetupSteps().length,
    coreTotal: getFeatureWallSetupSteps().length
  }
}

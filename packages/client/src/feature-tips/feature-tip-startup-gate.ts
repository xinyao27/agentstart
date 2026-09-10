import type { CliInstallStatus } from '@agentstart/protocol/cli-values'
import type { FeatureTipId } from '@agentstart/protocol/settings/feature-tips'
import type { OnboardingState } from '@agentstart/protocol/settings/onboarding'
import type { FeatureInteractionState } from '@agentstart/protocol/telemetry/interactions/state'

import { shouldShowOnboarding } from '../onboarding/should-show-onboarding'
import { getCompletedFeatureTipIds, getOrderedUnseenFeatureTips } from './catalog'

export type FeatureTipsAppOpenDecision =
  | { kind: 'open'; tipId: FeatureTipId }
  | { kind: 'skip' }
  | { kind: 'suppress-for-onboarding' }

export function isCliFeatureTipCompleted(status: CliInstallStatus): boolean {
  // Why: unsupported launch modes cannot complete setup, but an installed
  // launcher still needs attention until it is reachable on PATH.
  return !status.supported || (status.state === 'installed' && status.pathConfigured)
}

export function getFeatureTipsAppOpenDecision(args: {
  activeModal: string
  cliInstalled: boolean | null
  featureTipsSeenIds: readonly FeatureTipId[]
  featureInteractions: FeatureInteractionState
  onboarding: OnboardingState | null
  persistedUIReady: boolean
  promptedThisSession: boolean
  settings: object | null | undefined
  suppressedByOnboardingThisSession: boolean
}): FeatureTipsAppOpenDecision {
  if (args.onboarding !== null && shouldShowOnboarding(args.onboarding)) {
    return { kind: 'suppress-for-onboarding' }
  }

  if (
    args.promptedThisSession ||
    args.suppressedByOnboardingThisSession ||
    !args.persistedUIReady ||
    !args.settings ||
    args.onboarding === null ||
    args.activeModal !== 'none' ||
    args.cliInstalled === null ||
    shouldShowOnboarding(args.onboarding)
  ) {
    return { kind: 'skip' }
  }

  const unseenTips = getOrderedUnseenFeatureTips({
    seenTipIds: new Set<FeatureTipId>(args.featureTipsSeenIds),
    completedTipIds: getCompletedFeatureTipIds({
      cliInstalled: args.cliInstalled,
      featureInteractions: args.featureInteractions
    })
  })

  const nextTip = unseenTips[0]
  return nextTip ? { kind: 'open', tipId: nextTip.id } : { kind: 'skip' }
}

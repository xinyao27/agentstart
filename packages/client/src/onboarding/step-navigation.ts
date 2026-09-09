import type { PreflightStatusValue as PreflightStatus } from '@yiru/protocol'
import { ONBOARDING_FINAL_STEP, ONBOARDING_FLOW_VERSION } from '@yiru/protocol/settings/onboarding'
import type { OnboardingState } from '@yiru/protocol/settings/onboarding'

import { STEPS } from './use-onboarding-flow-types'

export type OnboardingStepSkipOptions = {
  skipIntegrations: boolean
  skipWindowsTerminal: boolean
}

export function shouldSkipIntegrationsStep(status: PreflightStatus | null): boolean {
  return status?.gh.installed === true
}

export function shouldSkipWindowsTerminalStep(isWindows: boolean): boolean {
  return !isWindows
}

export function isSkippedStepIndex(index: number, options: OnboardingStepSkipOptions): boolean {
  const step = STEPS[index]
  return (
    (options.skipIntegrations && step?.id === 'integrations') ||
    (options.skipWindowsTerminal && step?.id === 'windows_terminal')
  )
}

export function resolveOnboardingStepIndex(
  index: number,
  skipOptions: OnboardingStepSkipOptions,
  direction: 'forward' | 'backward'
): number {
  const lastIndex = STEPS.length - 1
  let nextIndex = Math.min(Math.max(index, 0), lastIndex)
  while (isSkippedStepIndex(nextIndex, skipOptions)) {
    const candidate = nextIndex + (direction === 'forward' ? 1 : -1)
    if (candidate < 0 || candidate > lastIndex) {
      return direction === 'forward' ? lastIndex : 0
    }
    nextIndex = candidate
  }
  return nextIndex
}

type OnboardingProgressSnapshot = Pick<
  OnboardingState,
  'flowVersion' | 'lastCompletedStep' | 'outcome'
>

export function remapOpenOnboardingLastCompletedStep({
  flowVersion,
  lastCompletedStep,
  outcome
}: OnboardingProgressSnapshot): number {
  if (flowVersion === ONBOARDING_FLOW_VERSION) {
    return lastCompletedStep
  }
  if (outcome === 'completed' && lastCompletedStep >= 4) {
    return ONBOARDING_FINAL_STEP
  }
  // Why: v3 was the four-step flow before the Windows terminal preference
  // page. Step 4 already meant notifications, so open progress resumes there.
  if (flowVersion === 3) {
    return Math.min(4, lastCompletedStep)
  }
  // Why: v2 was the five-step flow; missing/older versions were seven-step
  // data where step 4 was removed agent setup, not completed integrations.
  if (flowVersion === 2) {
    if (lastCompletedStep === 3) {
      return 2
    }
    if (lastCompletedStep >= 4) {
      return 3
    }
    return lastCompletedStep
  }
  if (lastCompletedStep === 3 || lastCompletedStep === 4) {
    return 2
  }
  return lastCompletedStep >= 5 ? 3 : lastCompletedStep
}

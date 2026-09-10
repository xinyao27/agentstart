import { ONBOARDING_FINAL_STEP } from '@agentstart/protocol/settings/onboarding'
import type { OnboardingState } from '@agentstart/protocol/settings/onboarding'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'
import { isWindowsUserAgent } from '~renderer/terminal-pane/pane-interactions'

import {
  isSkippedStepIndex,
  remapOpenOnboardingLastCompletedStep,
  resolveOnboardingStepIndex,
  shouldSkipIntegrationsStep,
  shouldSkipWindowsTerminalStep
} from './step-navigation'
import { persistStep } from './use-onboarding-flow-persistence'
import { STEPS, type StepNumber } from './use-onboarding-flow-types'

function isStepNumber(value: number): value is StepNumber {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

export function useOnboardingLifecycle(
  onboarding: OnboardingState,
  onOnboardingChange: (state: OnboardingState) => void
) {
  const preflightStatus = useAppStore((state) => state.preflightStatus)
  const preflightStatusChecked = useAppStore((state) => state.preflightStatusChecked)
  const refreshPreflightStatus = useAppStore((state) => state.refreshPreflightStatus)
  const effectivePreflightStatus = preflightStatus ?? useAppStore.getState().preflightStatus
  const skipIntegrations = shouldSkipIntegrationsStep(effectivePreflightStatus)
  const skipWindowsTerminal = shouldSkipWindowsTerminalStep(isWindowsUserAgent())
  const skipOptions = { skipIntegrations, skipWindowsTerminal }
  const remappedLastCompletedStep = remapOpenOnboardingLastCompletedStep(onboarding)
  const initialStepIndex = resolveOnboardingStepIndex(
    Math.min(Math.max(remappedLastCompletedStep, 0), STEPS.length - 1),
    skipOptions,
    'forward'
  )
  const [stepIndex, setStepIndex] = useState(initialStepIndex)
  const progressSteps = STEPS.map((step, index) => ({ step, index })).filter(
    ({ index }) => !isSkippedStepIndex(index, skipOptions)
  )
  const displayedStepIndex = resolveOnboardingStepIndex(stepIndex, skipOptions, 'forward')
  const currentStep = STEPS[displayedStepIndex]
  const progressStepIndex = Math.max(
    0,
    progressSteps.findIndex(({ index }) => index === displayedStepIndex)
  )
  const startTimeRef = useRef(0)

  useEffect(() => {
    startTimeRef.current = Date.now()
    void refreshPreflightStatus()
  }, [refreshPreflightStatus])

  const getNextStepIndex = useEventCallback((index: number): number =>
    resolveOnboardingStepIndex(index + 1, { skipIntegrations, skipWindowsTerminal }, 'forward')
  )
  const getPreviousStepIndex = (index: number): number =>
    resolveOnboardingStepIndex(index - 1, skipOptions, 'backward')

  useEffect(() => {
    if (currentStep.id !== 'integrations' || !preflightStatusChecked || !skipIntegrations) {
      return
    }
    const nextIndex = getNextStepIndex(displayedStepIndex)
    const skippedThroughStepNumber = Math.max(
      currentStep.stepNumber,
      STEPS[nextIndex].stepNumber - 1
    )
    void persistStep(skippedThroughStepNumber).then(onOnboardingChange, (error) => {
      toast.error(
        translate(
          'auto.components.onboarding.use.onboarding.flow.52acfbef51',
          'Could not save progress'
        ),
        { description: error instanceof Error ? error.message : String(error) }
      )
    })
  }, [
    currentStep.id,
    currentStep.stepNumber,
    getNextStepIndex,
    onOnboardingChange,
    preflightStatusChecked,
    skipIntegrations,
    displayedStepIndex
  ])

  const startedTrackedRef = useRef(false)
  useEffect(() => {
    if (startedTrackedRef.current) {
      return
    }
    startedTrackedRef.current = true
    const resumedStep =
      remappedLastCompletedStep >= 1 &&
      remappedLastCompletedStep < ONBOARDING_FINAL_STEP &&
      isStepNumber(remappedLastCompletedStep)
        ? remappedLastCompletedStep
        : null
    track('onboarding_started', resumedStep === null ? {} : { resumed_from_step: resumedStep })
  }, [remappedLastCompletedStep])

  const stepStartedAtRef = useRef(0)
  useEffect(() => {
    stepStartedAtRef.current = Date.now()
    track('onboarding_step_viewed', {
      step: currentStep.stepNumber,
      value_kind: currentStep.valueKind
    })
  }, [currentStep.id, currentStep.stepNumber, currentStep.valueKind])

  return {
    stepIndex: displayedStepIndex,
    setStepIndex,
    currentStep,
    progressSteps,
    progressStepIndex,
    skipOptions,
    getNextStepIndex,
    getPreviousStepIndex,
    startTimeRef,
    consumeStepDurationMs: () => Math.max(0, Date.now() - stepStartedAtRef.current)
  }
}

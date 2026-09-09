import { ONBOARDING_FINAL_STEP } from '@yiru/protocol/settings/onboarding'
import type { OnboardingState } from '@yiru/protocol/settings/onboarding'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { applyDocumentTheme } from '~renderer/editor/document-theme'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'

import { useOnboardingLifecycle } from './lifecycle'
import { useOnboardingPreferences } from './preferences'
import { useOnboardingProjectActions } from './project-actions'
import { prepareSkippedOnboardingPreferences } from './skipped-preferences'
import { resolveOnboardingStepIndex } from './step-navigation'
import { persistStep, useCloseWith, usePersistCurrentStep } from './use-onboarding-flow-persistence'
import { STEPS } from './use-onboarding-flow-types'
import { buildWindowsTerminalSnapshotPayload } from './windows-terminal-onboarding-telemetry'

export { STEPS } from './use-onboarding-flow-types'
export type { StepId, StepNumber } from './use-onboarding-flow-types'

export type OnboardingFlowController = ReturnType<typeof useOnboardingFlow>

export function useOnboardingFlow(
  onboarding: OnboardingState,
  onOnboardingChange: (state: OnboardingState) => void
) {
  const openModal = useAppStore((state) => state.openModal)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    stepIndex,
    setStepIndex,
    currentStep,
    progressSteps,
    progressStepIndex,
    skipOptions,
    getNextStepIndex,
    getPreviousStepIndex,
    startTimeRef,
    consumeStepDurationMs
  } = useOnboardingLifecycle(onboarding, onOnboardingChange)
  const {
    settings,
    updateSettings,
    selectedAgent,
    setSelectedAgent,
    yoloPermissions,
    setYoloPermissions,
    theme,
    setTheme,
    detectedSet,
    isDetectingAgents,
    getThemeBeforePreview
  } = useOnboardingPreferences(currentStep.id)
  const closeWith = useCloseWith({
    onOnboardingChange,
    onboardingChecklist: onboarding.checklist,
    startTimeRef,
    setError
  })
  const projectActions = useOnboardingProjectActions({
    settings,
    busyLabel,
    setBusyLabel,
    setError,
    closeWith,
    consumeStepDurationMs
  })
  const persistCurrentStep = usePersistCurrentStep({
    currentStepId: currentStep.id,
    selectedAgent,
    yoloPermissions,
    theme,
    settings,
    updateSettings,
    onboardingChecklist: onboarding.checklist,
    onOnboardingChange,
    setError
  })

  const nextInFlightRef = useRef(false)
  const trackCurrentStepCompleted = (advancedVia: 'button' | 'keyboard'): void => {
    const durationMs = consumeStepDurationMs()
    track('onboarding_step_completed', {
      step: currentStep.stepNumber,
      value_kind: currentStep.valueKind,
      duration_ms: durationMs,
      advanced_via: advancedVia
    })
    if (currentStep.id === 'windows_terminal') {
      track(
        'onboarding_windows_terminal_snapshot',
        buildWindowsTerminalSnapshotPayload({
          settings,
          exitAction: 'continue',
          durationMs,
          advancedVia
        })
      )
    }
  }

  const next = async (advancedVia: 'button' | 'keyboard' = 'button') => {
    if (nextInFlightRef.current || busyLabel) {
      return
    }
    nextInFlightRef.current = true
    try {
      const result = await persistCurrentStep()
      if (!result.ok) {
        return
      }
      trackCurrentStepCompleted(advancedVia)
      if (currentStep.id === 'notifications') {
        setBusyLabel('Opening Add Project...')
        const closed = await closeWith('completed', {}, ONBOARDING_FINAL_STEP, 'add_project_modal')
        if (closed) {
          openModal('add-repo')
        }
        return
      }
      const nextIndex = getNextStepIndex(stepIndex)
      const skippedThroughStepNumber = STEPS[nextIndex].stepNumber - 1
      if (skippedThroughStepNumber > currentStep.stepNumber) {
        try {
          onOnboardingChange(await persistStep(skippedThroughStepNumber))
        } catch (persistError) {
          toast.error(
            translate(
              'auto.components.onboarding.use.onboarding.flow.52acfbef51',
              'Could not save progress'
            ),
            {
              description:
                persistError instanceof Error ? persistError.message : String(persistError)
            }
          )
        }
      }
      setStepIndex(nextIndex)
    } finally {
      setBusyLabel(null)
      nextInFlightRef.current = false
    }
  }

  const skipToRepo = async () => {
    if (busyLabel || currentStep.id === 'notifications') {
      return
    }
    setError(null)
    const durationMs = consumeStepDurationMs()
    const preferencesSaved = await prepareSkippedOnboardingPreferences({
      currentStepId: currentStep.id,
      themeBeforePreview: getThemeBeforePreview(),
      settingsTheme: settings?.theme,
      selectedAgent,
      setTheme,
      applyTheme: applyDocumentTheme,
      updateSettings,
      setError
    })
    if (!preferencesSaved) {
      return
    }
    const stepId = currentStep.id
    const stepNumber = currentStep.stepNumber
    const valueKind = currentStep.valueKind
    setBusyLabel('Opening Add Project...')
    try {
      const closed = await closeWith('completed', {}, ONBOARDING_FINAL_STEP, 'add_project_modal')
      if (!closed) {
        return
      }
      track('onboarding_step_skipped', {
        step: stepNumber,
        value_kind: valueKind,
        duration_ms: durationMs,
        advanced_via: 'button'
      })
      if (stepId === 'windows_terminal') {
        track(
          'onboarding_windows_terminal_snapshot',
          buildWindowsTerminalSnapshotPayload({
            settings,
            exitAction: 'skip_to_project_setup',
            durationMs,
            advancedVia: 'button'
          })
        )
      }
      openModal('add-repo')
    } finally {
      setBusyLabel(null)
    }
  }

  const dismissOnboarding = async (
    advancedVia: 'button' | 'keyboard' = 'button'
  ): Promise<boolean> => {
    if (busyLabel) {
      return false
    }
    setError(null)
    const closed = await closeWith('dismissed', {}, currentStep.stepNumber, undefined, {
      durationMs: consumeStepDurationMs(),
      advancedVia
    })
    if (closed && projectActions.nestedScan) {
      projectActions.trackBackAndClear()
    }
    return closed
  }

  const back = () => {
    if (projectActions.nestedScan) {
      projectActions.trackBackAndClear()
      return
    }
    setStepIndex(getPreviousStepIndex)
  }

  const jumpToStep = (index: number) => {
    if (projectActions.nestedScan && index !== stepIndex) {
      projectActions.trackBackAndClear()
    }
    setStepIndex(
      resolveOnboardingStepIndex(index, skipOptions, index < stepIndex ? 'backward' : 'forward')
    )
  }

  return {
    settings,
    updateSettings,
    stepIndex,
    progressSteps,
    progressStepIndex,
    currentStep,
    selectedAgent,
    setSelectedAgent,
    yoloPermissions,
    setYoloPermissions,
    theme,
    setTheme,
    cloneUrl: projectActions.cloneUrl,
    setCloneUrl: projectActions.setCloneUrl,
    nestedScan: projectActions.nestedScan,
    nestedScanInProgress: projectActions.nestedScanInProgress,
    nestedSelectedPaths: projectActions.nestedSelectedPaths,
    setNestedSelectedPaths: projectActions.setNestedSelectedPaths,
    importNested: projectActions.importNested,
    cancelNested: projectActions.cancelNested,
    stopNestedScan: projectActions.stopNestedScan,
    canImportNestedForTelemetry: projectActions.canImportNestedForTelemetry,
    hasExistingProject: projectActions.hasExistingProject,
    serverPath: projectActions.serverPath,
    setServerPath: projectActions.setServerPath,
    cloneDestination: projectActions.cloneDestination,
    setCloneDestination: projectActions.setCloneDestination,
    busyLabel,
    error,
    detectedSet,
    isDetectingAgents,
    next,
    skipToRepo,
    dismissOnboarding,
    back,
    jumpToStep,
    openFolder: projectActions.openFolder,
    continueWithExistingProject: projectActions.continueWithExistingProject,
    clone: projectActions.clone
  }
}

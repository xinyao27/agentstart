import { applyAgentPermissionMode } from '@yiru/protocol/agent/launch/permissions'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { ONBOARDING_FINAL_STEP, ONBOARDING_FLOW_VERSION } from '@yiru/protocol/settings/onboarding'
import type { OnboardingState } from '@yiru/protocol/settings/onboarding'
import type { EventProps } from '@yiru/protocol/telemetry/events/catalog'
import { useRef } from 'react'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'

import type { StepId, StepNumber } from './use-onboarding-flow-types'

export async function persistStep(
  stepNumber: number,
  updates: Partial<OnboardingState> = {}
): Promise<OnboardingState> {
  return shellClient.onboarding.update({
    flowVersion: ONBOARDING_FLOW_VERSION,
    lastCompletedStep: Math.max(stepNumber, -1),
    ...updates
  })
}

function selectedAgentOrBlank(agent: TuiAgent | null): TuiAgent | 'blank' {
  return agent ?? 'blank'
}

export function buildCompletedOnboardingNotificationSettings(
  notifications: GlobalSettings['notifications']
): GlobalSettings['notifications'] {
  return {
    ...notifications,
    enabled: true,
    agentTaskComplete: true,
    terminalBell: true
  }
}

type CloseWithDeps = {
  onOnboardingChange: (state: OnboardingState) => void
  onboardingChecklist: OnboardingState['checklist']
  startTimeRef: { current: number }
  setError: (msg: string | null) => void
}

export type DismissedExtras = {
  advancedVia: NonNullable<EventProps<'onboarding_dismissed'>['advanced_via']>
  durationMs: number
}

export function buildOnboardingDismissedPayload(
  lastStepReached: StepNumber,
  dismissedExtras?: DismissedExtras
): EventProps<'onboarding_dismissed'> {
  return {
    last_step: lastStepReached,
    ...(dismissedExtras
      ? {
          duration_ms: dismissedExtras.durationMs,
          advanced_via: dismissedExtras.advancedVia
        }
      : {})
  }
}

export function trackOnboardingDismissed(
  lastStepReached: StepNumber,
  dismissedExtras?: DismissedExtras
): void {
  track('onboarding_dismissed', buildOnboardingDismissedPayload(lastStepReached, dismissedExtras))
}

export function useCloseWith({
  onOnboardingChange,
  onboardingChecklist,
  startTimeRef,
  setError
}: CloseWithDeps) {
  // Why: onboarding closes exactly once. On the final notifications step both
  // the "Add your first project" handoff (completed) and a click-off/Escape
  // dismissal (dismissed) can reach closeWith, and next()'s persist window
  // leaves the modal interactive with no busy flag. This latch makes closeWith
  // idempotent so the first close wins — no double onboarding.update write and
  // no double completed/dismissed telemetry.
  const closedRef = useRef(false)
  return async (
    outcome: 'completed' | 'dismissed',
    checklist: Partial<OnboardingState['checklist']>,
    lastStepReached: StepNumber,
    completedPath?: 'open_folder' | 'clone_url' | 'add_project_modal',
    dismissedExtras?: DismissedExtras
  ): Promise<boolean> => {
    if (closedRef.current) {
      return false
    }
    closedRef.current = true
    let nextState: OnboardingState
    try {
      // Why: main-process updateOnboarding already merges with current state,
      // so spreading the local (potentially stale) onboarding.checklist would
      // overwrite concurrent updates.
      nextState = await shellClient.onboarding.update({
        flowVersion: ONBOARDING_FLOW_VERSION,
        closedAt: Date.now(),
        outcome,
        lastCompletedStep: outcome === 'completed' ? ONBOARDING_FINAL_STEP : -1,
        checklist: {
          ...checklist,
          dismissed: outcome === 'dismissed'
        }
      })
    } catch (err) {
      // Why: the persist failed, so onboarding did not actually close — clear
      // the latch so the user can retry the close action.
      closedRef.current = false
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
    onOnboardingChange(nextState)
    if (outcome === 'completed' && completedPath) {
      const total = Math.max(0, Date.now() - startTimeRef.current)
      // Why: no `is_git_repo` — project selection now happens in the Add
      // Project modal after this fires, so the signal moved to
      // `repo_added.is_git_repo`. See docs/reference/telemetry-availability.md.
      track('onboarding_completed', {
        path: completedPath,
        total_duration_ms: total
      })
      // Why: checklist items completed by the wizard itself must fire
      // `activation_checklist_item_completed` so the post-wizard panel and
      // analytics agree. Other items (ranFirstAgent, triedCmdJ, …) emit
      // from their own product surfaces.
      if (checklist.addedRepo && !onboardingChecklist.addedRepo) {
        track('activation_checklist_item_completed', {
          item: 'addedRepo',
          time_since_completed_ms: 0
        })
      }
      if (checklist.addedFolder && !onboardingChecklist.addedFolder) {
        track('activation_checklist_item_completed', {
          item: 'addedFolder',
          time_since_completed_ms: 0
        })
      }
    }
    if (outcome === 'completed') {
      // Why: closeWith updates parent state synchronously from this hook's
      // perspective, but the modal unmounts on the next React commit.
      window.setTimeout(() => {
        void shellClient.starNag.onboardingCompleted()
      }, 0)
    } else if (outcome === 'dismissed') {
      trackOnboardingDismissed(lastStepReached, dismissedExtras)
    }
    return true
  }
}

type PersistCurrentStepDeps = {
  currentStepId: StepId
  selectedAgent: TuiAgent | null
  yoloPermissions: boolean
  theme: GlobalSettings['theme']
  settings: GlobalSettings | null
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void> | void
  onboardingChecklist: OnboardingState['checklist']
  onOnboardingChange: (state: OnboardingState) => void
  setError: (msg: string | null) => void
}

export type PersistCurrentStepResult = {
  ok: boolean
}

export function usePersistCurrentStep({
  currentStepId,
  selectedAgent,
  yoloPermissions,
  theme,
  settings,
  updateSettings,
  onboardingChecklist,
  onOnboardingChange,
  setError
}: PersistCurrentStepDeps) {
  return async (): Promise<PersistCurrentStepResult> => {
    if (!settings) {
      return { ok: false }
    }
    try {
      if (currentStepId === 'agent') {
        const defaultTuiAgent = selectedAgentOrBlank(selectedAgent)
        await updateSettings({
          defaultTuiAgent,
          ...applyAgentPermissionMode({
            mode: yoloPermissions ? 'yolo' : 'manual',
            agentDefaultArgs: settings.agentDefaultArgs,
            agentDefaultEnv: settings.agentDefaultEnv
          })
        })
        const choseAgent = defaultTuiAgent !== 'blank'
        const wasAlreadyChosen = onboardingChecklist.choseAgent
        onOnboardingChange(
          await persistStep(1, {
            checklist: { ...onboardingChecklist, choseAgent }
          })
        )
        if (choseAgent && !wasAlreadyChosen) {
          track('activation_checklist_item_completed', {
            item: 'choseAgent',
            time_since_completed_ms: 0
          })
        }
        return { ok: true }
      }
      if (currentStepId === 'theme') {
        await updateSettings({ theme })
        onOnboardingChange(await persistStep(2))
        return { ok: true }
      }
      if (currentStepId === 'notifications') {
        await updateSettings({
          notifications: buildCompletedOnboardingNotificationSettings(settings.notifications)
        })
        useAppStore.getState().recordFeatureInteraction('notifications')
        onOnboardingChange(await persistStep(ONBOARDING_FINAL_STEP))
        return { ok: true }
      }
      if (currentStepId === 'windows_terminal') {
        // Why: the Windows terminal controls persist on selection. Continuing
        // only marks the preference page complete for resume/telemetry state.
        onOnboardingChange(await persistStep(4))
        return { ok: true }
      }
      if (currentStepId === 'integrations') {
        // Why: GitHub connections persist through their own store slice when the user actually wires them up. The step itself
        // is a no-op for settings/onboarding state beyond marking it
        // completed.
        onOnboardingChange(await persistStep(3))
        return { ok: true }
      }
      return { ok: false }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return { ok: false }
    }
  }
}

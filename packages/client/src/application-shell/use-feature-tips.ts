import type { OnboardingState } from '@agentstart/protocol/settings/onboarding'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import {
  getFeatureTipsAppOpenDecision,
  isCliFeatureTipCompleted
} from '../feature-tips/feature-tip-startup-gate'
import {
  trackCommandPaletteFeatureTipShown,
  trackAgentStartCliFeatureTipShown
} from '../feature-tips/feature-tip-telemetry'
import { shouldShowOnboarding } from '../onboarding/should-show-onboarding'
import { readCliInstallStatus } from '../runtime/cli-install-client'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'

type FeatureTipsInput = Pick<AppState, 'activeModal' | 'persistedUIReady' | 'settings'> & {
  onboarding: OnboardingState | null
  onboardingLoaded: boolean
}

export function useFeatureTips({
  activeModal,
  onboarding,
  onboardingLoaded,
  persistedUIReady,
  settings
}: FeatureTipsInput): void {
  const { contextualToursAutoEligible, featureInteractions, featureTipsSeenIds } = useAppStore(
    useShallow((state) => ({
      contextualToursAutoEligible: state.contextualToursAutoEligible,
      featureInteractions: state.featureInteractions,
      featureTipsSeenIds: state.featureTipsSeenIds
    }))
  )
  const promptedThisSessionRef = useRef(false)
  const suppressedByOnboardingThisSessionRef = useRef(false)
  const [isCliInstalled, setIsCliInstalled] = useState<boolean | null>(null)

  useEffect(() => {
    const suppressTours = !onboardingLoaded || shouldShowOnboarding(onboarding)
    useAppStore.getState().setContextualToursOnboardingVisible(suppressTours)
  }, [onboarding, onboardingLoaded])

  useEffect(() => {
    if (!persistedUIReady || !onboardingLoaded || contextualToursAutoEligible !== null) {
      return
    }
    useAppStore.getState().setContextualToursAutoEligible(shouldShowOnboarding(onboarding))
  }, [contextualToursAutoEligible, onboarding, onboardingLoaded, persistedUIReady])

  useEffect(() => {
    if (!persistedUIReady) {
      return
    }
    let cancelled = false
    void readCliInstallStatus()
      .then((status) => {
        if (!cancelled) {
          setIsCliInstalled(isCliFeatureTipCompleted(status))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsCliInstalled(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [persistedUIReady])

  useEffect(() => {
    const decision = getFeatureTipsAppOpenDecision({
      activeModal,
      cliInstalled: isCliInstalled,
      featureTipsSeenIds,
      featureInteractions,
      onboarding,
      persistedUIReady,
      promptedThisSession: promptedThisSessionRef.current,
      settings,
      suppressedByOnboardingThisSession: suppressedByOnboardingThisSessionRef.current
    })
    if (decision.kind === 'suppress-for-onboarding') {
      suppressedByOnboardingThisSessionRef.current = true
      return
    }
    if (decision.kind !== 'open') {
      return
    }
    promptedThisSessionRef.current = true
    if (decision.tipId === 'agentstart-cli') {
      trackAgentStartCliFeatureTipShown('app_open')
    } else if (decision.tipId === 'command-palette') {
      trackCommandPaletteFeatureTipShown('app_open')
    }
    const state = useAppStore.getState()
    state.markFeatureTipsSeen([decision.tipId])
    state.openModal('feature-tips', { source: 'app_open', tipId: decision.tipId })
  }, [
    activeModal,
    featureInteractions,
    featureTipsSeenIds,
    isCliInstalled,
    onboarding,
    persistedUIReady,
    settings
  ])
}

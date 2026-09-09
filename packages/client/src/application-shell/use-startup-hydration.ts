import type { Repo } from '@yiru/protocol/project/repository'
import type { OnboardingState } from '@yiru/protocol/settings/onboarding'
import { useEffect, useState } from 'react'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'

import { onOnboardingReopened } from '../onboarding/show-onboarding-event'
import { useEventCallback } from '../react/use-event-callback'
import { useAppStore } from '../store/state'
import { hydrateStartupSession, type StartupHydrationAttempt } from './startup-hydration'
import { recoverStartupSession } from './startup-recovery'

type StartupHydrationState = {
  onboarding: OnboardingState | null
  onboardingLoaded: boolean
  setOnboarding: (state: OnboardingState) => void
}

export function useStartupHydration(
  isProjectCatalogPending: boolean,
  repos: readonly Repo[],
  runtimeEnvironments: readonly PublicKnownRuntimeEnvironment[]
): StartupHydrationState {
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)
  const [onboardingLoaded, setOnboardingLoaded] = useState(false)
  const hydrate = useEventCallback(
    (args: Omit<Parameters<typeof hydrateStartupSession>[0], 'repos' | 'runtimeEnvironments'>) =>
      hydrateStartupSession({ ...args, repos, runtimeEnvironments })
  )

  useEffect(() => onOnboardingReopened(setOnboarding), [])
  useEffect(() => {
    if (isProjectCatalogPending) {
      return
    }
    let cancelled = false
    const abortController = new AbortController()
    const attempt: StartupHydrationAttempt = {
      reconnectStarted: false,
      uiHydrated: false
    }
    const actions = useAppStore.getState()
    const isCancelled = (): boolean => cancelled

    void (async () => {
      try {
        const restoredOnboarding = await hydrate({
          actions,
          attempt,
          isCancelled,
          signal: abortController.signal
        })
        if (!cancelled && restoredOnboarding !== null) {
          setOnboarding(restoredOnboarding)
          setOnboardingLoaded(true)
        }
      } catch (error) {
        await recoverStartupSession({
          actions,
          attempt,
          error,
          isCancelled,
          signal: abortController.signal
        })
      } finally {
        void actions.initGitHubCache()
      }
    })()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [hydrate, isProjectCatalogPending])

  return { onboarding, onboardingLoaded, setOnboarding }
}

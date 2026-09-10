import { toRuntimeExecutionHostId, type ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { OnboardingState } from '@agentstart/protocol/settings/onboarding'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { collectFolderWorkspaceKeysFromSession } from '~renderer/workspace/session-hydration-keys'

import { fetchWorkspaceSessionWithRuntimeHostOwners } from '../editor/workspace-session-host-persistence'
import { shellClient } from '../runtime/shell-client'
import { getRuntimeUIState } from '../runtime/ui-client'
import { syncZoomCSSVar } from '../settings/ui-zoom'
import {
  logRendererStartupDiagnostic,
  timeRendererStartupStep,
  timeRendererStartupSyncStep
} from '../startup/diagnostics'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'
import { publishTerminalViewAttributesAtAppStart } from '../terminal-pane/terminal-appearance'
import { getSystemPrefersDark } from '../terminal/theme'
import { hydratePersistedUIAfterStartupRead } from './startup-ui-hydration'

export type StartupHydrationActions = Pick<
  AppState,
  | 'completeHydratedWorktreePurge'
  | 'fetchKeybindings'
  | 'fetchSettings'
  | 'fetchAgentStartProfiles'
  | 'hydrateBrowserSession'
  | 'hydrateEditorSession'
  | 'hydratePersistedUI'
  | 'hydrateRuntimeEnvironmentStatuses'
  | 'hydrateTabsSession'
  | 'hydrateWorkspaceSession'
  | 'pruneLastVisitedTimestamps'
  | 'reconnectPersistedTerminals'
  | 'seedActiveWorktreeLastVisitedIfMissing'
  | 'setHydrationSucceeded'
>

export type StartupHydrationAttempt = {
  reconnectStarted: boolean
  uiHydrated: boolean
}

type StartupHydrationInput = {
  actions: StartupHydrationActions
  attempt: StartupHydrationAttempt
  isCancelled: () => boolean
  repos: readonly Repo[]
  runtimeEnvironments: readonly PublicKnownRuntimeEnvironment[]
  signal: AbortSignal
}

export async function hydrateStartupSession({
  actions,
  attempt,
  isCancelled,
  repos,
  runtimeEnvironments,
  signal
}: StartupHydrationInput): Promise<OnboardingState | null> {
  const startupStartedAt = performance.now()
  logRendererStartupDiagnostic('startup-chain-start')
  void actions.fetchAgentStartProfiles()
  const keybindingsPromise = timeRendererStartupStep('fetch-keybindings', () =>
    actions.fetchKeybindings()
  )
  keybindingsPromise.catch(() => {})
  const onboardingPromise = timeRendererStartupStep('onboarding-get', () =>
    shellClient.onboarding.get()
  )
  onboardingPromise.catch(() => {})
  const startupRuntimeHostIds: ExecutionHostId[] = runtimeEnvironments.map((environment) =>
    toRuntimeExecutionHostId(environment.id)
  )
  const sessionReadPromise = timeRendererStartupStep('session-get', () =>
    fetchWorkspaceSessionWithRuntimeHostOwners(shellClient.session, repos, startupRuntimeHostIds)
  )

  await timeRendererStartupStep('fetch-settings', () => actions.fetchSettings())
  publishTerminalViewAttributesAtAppStart(useAppStore.getState().settings, getSystemPrefersDark())

  const persistedUI = await timeRendererStartupStep('ui-get', () =>
    getRuntimeUIState(useAppStore.getState().settings)
  )
  attempt.uiHydrated = timeRendererStartupSyncStep('hydrate-persisted-ui', () =>
    hydratePersistedUIAfterStartupRead({
      persistedUI,
      cancelled: isCancelled(),
      hydratePersistedUI: actions.hydratePersistedUI
    })
  )
  const sessionRead = await sessionReadPromise
  await keybindingsPromise
  if (isCancelled()) {
    return null
  }

  const sessionHydrationOptions = {
    additionalValidWorkspaceKeys: collectFolderWorkspaceKeysFromSession(sessionRead.session)
  }
  timeRendererStartupSyncStep('hydrate-session-stores', () => {
    actions.hydrateWorkspaceSession(sessionRead.session, {
      ...sessionHydrationOptions,
      runtimeHostIdByWorkspaceSessionKey: sessionRead.runtimeHostIdByWorkspaceSessionKey
    })
    actions.hydrateTabsSession(sessionRead.session, sessionHydrationOptions)
    actions.hydrateEditorSession(sessionRead.session, sessionHydrationOptions)
    actions.hydrateBrowserSession(sessionRead.session, sessionHydrationOptions)
  })
  actions.completeHydratedWorktreePurge()
  timeRendererStartupSyncStep('visit-timestamp-prune', () => {
    actions.pruneLastVisitedTimestamps()
    actions.seedActiveWorktreeLastVisitedIfMissing()
  })
  const onboarding = await onboardingPromise
  if (isCancelled()) {
    return null
  }

  attempt.reconnectStarted = true
  await timeRendererStartupStep('reconnect-terminals', () =>
    actions.reconnectPersistedTerminals(signal)
  )
  syncZoomCSSVar()
  actions.setHydrationSucceeded(true)
  actions.completeHydratedWorktreePurge()
  void actions.hydrateRuntimeEnvironmentStatuses(runtimeEnvironments)
  logRendererStartupDiagnostic('startup-hydration-done', {
    durationMs: Math.round(performance.now() - startupStartedAt)
  })
  return onboarding
}

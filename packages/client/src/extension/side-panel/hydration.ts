import { toRuntimeExecutionHostId, type ExecutionHostId } from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'

import { fetchWorkspaceSessionWithRuntimeHostOwners } from '../../editor/workspace-session-host-persistence'
import { shellClient } from '../../runtime/shell-client'
import { getRuntimeUIState } from '../../runtime/ui-client'
import { useAppStore } from '../../store/state'
import { collectFolderWorkspaceKeysFromSession } from '../../workspace/session-hydration-keys'

export async function hydrateSidePanelNavigation(
  repos: readonly Repo[],
  runtimeEnvironments: readonly PublicKnownRuntimeEnvironment[]
): Promise<void> {
  const initial = useAppStore.getState()
  void initial.fetchYiruProfiles()
  const keybindings = initial.fetchKeybindings()
  const runtimeHostIds: ExecutionHostId[] = runtimeEnvironments.map((environment) =>
    toRuntimeExecutionHostId(environment.id)
  )
  const sessionReadPromise = fetchWorkspaceSessionWithRuntimeHostOwners(
    shellClient.session,
    repos,
    runtimeHostIds
  )

  await initial.fetchSettings()
  const settings = useAppStore.getState().settings
  if (settings) {
    const persistedUi = await getRuntimeUIState(settings)
    useAppStore.getState().hydratePersistedUI(persistedUi, 'startup')
  }

  const sessionRead = await sessionReadPromise
  const hydrationOptions = {
    additionalValidWorkspaceKeys: collectFolderWorkspaceKeysFromSession(sessionRead.session)
  }
  const state = useAppStore.getState()
  state.hydrateWorkspaceSession(sessionRead.session, {
    ...hydrationOptions,
    runtimeHostIdByWorkspaceSessionKey: sessionRead.runtimeHostIdByWorkspaceSessionKey
  })
  state.hydrateTabsSession(sessionRead.session, hydrationOptions)
  state.hydrateEditorSession(sessionRead.session, hydrationOptions)
  state.hydrateBrowserSession(sessionRead.session, hydrationOptions)
  await keybindings
  void state.hydrateRuntimeEnvironmentStatuses(runtimeEnvironments)
}

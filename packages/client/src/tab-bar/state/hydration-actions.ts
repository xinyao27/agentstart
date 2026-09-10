import { folderWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { StateCreator } from 'zustand'
import { addAdditionalValidWorkspaceKeys } from '~renderer/workspace/session-hydration-keys'

import type { AppState } from '../../store/types'
import { buildHydratedTabState } from './hydration'
import type { TabsSlice } from './slice'

export function createHydrationActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<TabsSlice, 'hydrateTabsSession'> {
  return {
    hydrateTabsSession: (session, options) => {
      const state = get()
      const validWorktreeIds = new Set(
        Object.values(state.worktreesByRepo)
          .flat()
          .map((w) => w.id)
      )
      for (const workspace of state.folderWorkspaces) {
        validWorktreeIds.add(folderWorkspaceKey(workspace.id))
      }
      addAdditionalValidWorkspaceKeys(validWorktreeIds, options)
      set(buildHydratedTabState(session, validWorktreeIds))
    }
  }
}

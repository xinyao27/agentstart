import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useAppStore } from '~renderer/store/state'
import { getSettingsForWorktreeRuntimeOwner } from '~renderer/worktree/runtime-owner'

export function getRightSidebarWorktreeRuntimeSettings(
  worktreeId: string | null | undefined
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> {
  const store = useAppStore.getState()
  // Why: right-sidebar file/git actions operate on the selected workspace.
  // Route by that workspace owner so global focused-host changes cannot retarget them.
  return getSettingsForWorktreeRuntimeOwner(store, worktreeId)
}

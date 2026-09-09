import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import {
  isRemoteRuntimeSessionActive,
  moveRemoteRuntimeSessionTab
} from '~renderer/runtime/remote-runtime-session'
import type { RuntimeMobileSessionTabMove } from '~renderer/runtime/remote-session/session-model'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

export function mirrorRemoteRuntimeTabMove(
  args: RuntimeMobileSessionTabMove & {
    worktreeId: string
  }
): void {
  const environmentId = getRuntimeEnvironmentIdForWorktree(
    readProjectCatalogRuntimeState(),
    args.worktreeId
  )
  if (!isRemoteRuntimeSessionActive(environmentId)) {
    return
  }
  void moveRemoteRuntimeSessionTab({
    ...args,
    environmentId
  })
}

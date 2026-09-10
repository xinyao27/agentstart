import type { Tab } from '@agentstart/protocol/workspace/tabs'
import {
  getRuntimeEnvironmentIdForWorktree,
  type WorktreeRuntimeOwnerState
} from '~renderer/worktree/runtime-owner'

import { closeRemoteSessionTabCommand } from './remote-session/commands'
import { requestRemoteSessionTabsRefresh } from './remote-session/tabs-refresh-requests'

type MirroredEditorFile = {
  id: string
  mirroredFromRuntimeSession?: boolean
}

export type MirroredEditorCloseState = WorktreeRuntimeOwnerState & {
  openFiles: readonly MirroredEditorFile[]
  unifiedTabsByWorktree: Record<string, Tab[]>
}

// Why: an editor file mirrored from a runtime session is owned by the host. The
// host republishes its open files to companions, so removing the tab only locally
// is undone by the next snapshot. Tell the host to close its own tab; the close
// intent recorded by the RPC suppresses re-mirroring until the snapshot catches up.
// Side-effecting only — callers still run their normal local close. No-op (returns
// false) for non-mirrored files, so the host's own closes are untouched.
export function notifyHostOfMirroredEditorClose(
  state: MirroredEditorCloseState,
  worktreeId: string | null | undefined,
  fileId: string
): boolean {
  if (!worktreeId) {
    return false
  }
  const file = state.openFiles.find((candidate) => candidate.id === fileId)
  if (!file?.mirroredFromRuntimeSession) {
    return false
  }
  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  if (!runtimeEnvironmentId?.trim()) {
    return false
  }
  // Why: a mirrored editor unified tab carries the host's tab id as `id` and the
  // local file id as `entityId`, and the host close RPC resolves editor tabs by id.
  const unifiedTab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (tab) => tab.contentType === 'editor' && tab.entityId === fileId
  )
  if (!unifiedTab) {
    return false
  }
  void closeRemoteSessionTabCommand({
    worktreeId,
    tabId: unifiedTab.id,
    environmentId: runtimeEnvironmentId
  }).then(async (result) => {
    if (result.status === 'completed') {
      await requestRemoteSessionTabsRefresh({
        environmentId: runtimeEnvironmentId,
        worktreeId
      })
    }
  })
  return true
}

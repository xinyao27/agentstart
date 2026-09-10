import type { FsChangedPayload } from '@agentstart/protocol/files/watch-values'

export const AGENTSTART_WORKTREE_FILE_CHANGE_EVENT = 'agentstart:worktree-file-change'

export type WorktreeFileChangeEventDetail = {
  payload: FsChangedPayload
  runtimeEnvironmentId: string | null
}

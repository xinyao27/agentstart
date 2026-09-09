import type { FsChangedPayload } from '@yiru/protocol/files/watch-values'

export const YIRU_WORKTREE_FILE_CHANGE_EVENT = 'yiru:worktree-file-change'

export type WorktreeFileChangeEventDetail = {
  payload: FsChangedPayload
  runtimeEnvironmentId: string | null
}

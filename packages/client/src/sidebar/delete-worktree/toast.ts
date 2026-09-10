import { translate } from '~renderer/i18n/i18n'
import {
  isLockedWorktreeRemovalError,
  isUnregisteredWorktreeDirectoryError,
  type WorktreeForceDeleteReason
} from '~renderer/worktree/removal-policy'
export type DeleteWorktreeToastCopy = {
  title: string
  description?: string
  isDestructive: boolean
}

export function getDeleteWorktreeToastCopy(
  worktreeName: string,
  forceDeleteReason: WorktreeForceDeleteReason | null,
  error: string,
  lockReason: string | null = null
): DeleteWorktreeToastCopy {
  if (isLockedWorktreeRemovalError(error)) {
    return {
      title: translate(
        'auto.components.sidebar.delete.worktree.toast.1d0fa5c0a5',
        'Failed to delete workspace {{value0}}',
        { value0: worktreeName }
      ),
      description: lockReason
        ? translate(
            'auto.components.sidebar.delete.worktree.toast.lockedReason',
            'This workspace is locked by Git. Git reported: {{value0}}. Run git worktree unlock <worktree-path> from its repository, then retry deletion.',
            { value0: lockReason }
          )
        : translate(
            'auto.components.sidebar.delete.worktree.toast.locked',
            'This workspace is locked by Git. Run git worktree unlock <worktree-path> from its repository, then retry deletion.'
          ),
      isDestructive: false
    }
  }

  if (isUnregisteredWorktreeDirectoryError(error)) {
    return {
      title: translate(
        'workspace.remove.unregistered.title',
        'Workspace directory needs attention'
      ),
      description: translate(
        'workspace.remove.unregistered.description',
        'Git no longer tracks this workspace. Its directory and files have been kept. Restore its Git registration or move the directory to a safe location, then retry removal.'
      ),
      isDestructive: false
    }
  }

  if (forceDeleteReason) {
    return {
      title: translate(
        'auto.components.sidebar.delete.worktree.toast.1d0fa5c0a5',
        'Failed to delete workspace {{value0}}',
        { value0: worktreeName }
      ),
      description: translate(
        'auto.components.sidebar.delete.worktree.toast.ead7b8ee15',
        'It has changed files. Use Force Delete to delete it anyway.'
      ),
      // Why: git commonly refuses the first delete when the worktree still has
      // modified or untracked files. Showing raw stderr in a destructive toast
      // made a normal cleanup step look like a AgentStart bug, so this common case
      // gets a concise explanation plus the force-delete path instead.
      isDestructive: false
    }
  }

  return {
    title: translate(
      'auto.components.sidebar.delete.worktree.toast.1d0fa5c0a5',
      'Failed to delete workspace {{value0}}',
      { value0: worktreeName }
    ),
    description: error,
    isDestructive: true
  }
}

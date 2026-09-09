import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import { toast } from 'sonner'
import { notifyEditorExternalFileChange, requestEditorSaveQuiesce } from '~renderer/editor/autosave'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionId } from '~renderer/runtime/connection-context'
import {
  bulkDiscardRuntimeGitPaths,
  bulkUnstageRuntimeGitPaths,
  discardRuntimeGitPath,
  unstageRuntimeGitPath
} from '~renderer/runtime/git-client'
import { useAppStore } from '~renderer/store/state'
import {
  getDiscardAllPaths,
  runDiscardAllForArea,
  type DiscardAllArea
} from '~renderer/workspace-panel/discard-all-sequence'

import type { SourceControlHistoryController } from './history'

export function useSourceControlFileMutations(scope: SourceControlHistoryController) {
  const {
    activeRepoSettings,
    activeWorktreeId,
    grouped,
    isExecutingBulk,
    pendingDiscard,
    refreshActiveGitStatusAfterMutation,
    setIsExecutingBulk,
    setPendingDiscard,
    worktreePath
  } = scope
  const handleUnstage = async (filePath: string) => {
    if (!worktreePath) {
      return
    }
    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      await unstageRuntimeGitPath(
        {
          // Why: route unstaging by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        filePath
      )
      await refreshActiveGitStatusAfterMutation()
    } catch {
      // git operation failed silently
    }
  }
  const discardSingle = async (filePath: string) => {
    if (!worktreePath || !activeWorktreeId) {
      return
    }
    const runtimeEnvironmentId =
      useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() || null
    // Why: quiesce autosave before discard so a delayed save cannot recreate
    // edits after Git restores the file.
    await requestEditorSaveQuiesce({
      worktreeId: activeWorktreeId,
      worktreePath,
      relativePath: filePath,
      runtimeEnvironmentId
    })
    const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
    await discardRuntimeGitPath(
      {
        // Why: route the discard by the repo OWNER host, not the focused runtime.
        settings: activeRepoSettings,
        worktreeId: activeWorktreeId,
        worktreePath,
        connectionId
      },
      filePath
    )
    notifyEditorExternalFileChange({
      worktreeId: activeWorktreeId,
      worktreePath,
      relativePath: filePath,
      runtimeEnvironmentId
    })
  }
  const discardMany = async (filePaths: string[]) => {
    if (!worktreePath || !activeWorktreeId) {
      return
    }
    const runtimeEnvironmentId =
      useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() || null
    // Why: quiesce every matching autosave before bulk discard so delayed
    // saves cannot recreate restored edits.
    await Promise.all(
      filePaths.map((relativePath) =>
        requestEditorSaveQuiesce({
          worktreeId: activeWorktreeId,
          worktreePath,
          relativePath,
          runtimeEnvironmentId
        })
      )
    )
    const connectionId = getConnectionId(activeWorktreeId) ?? undefined
    await bulkDiscardRuntimeGitPaths(
      {
        // Why: route the discard by the repo OWNER host, not the focused runtime.
        settings: activeRepoSettings,
        worktreeId: activeWorktreeId,
        worktreePath,
        connectionId
      },
      filePaths
    )
    for (const relativePath of filePaths) {
      notifyEditorExternalFileChange({
        worktreeId: activeWorktreeId,
        worktreePath,
        relativePath,
        runtimeEnvironmentId
      })
    }
  }
  const handleDiscard = async (filePath: string) => {
    try {
      await discardSingle(filePath)
      await refreshActiveGitStatusAfterMutation()
    } catch {
      // Why: row discard is fire-and-forget, while bulk callers aggregate
      // `discardSingle` failures into one notice.
    }
  }
  const handleRevertAllInArea = async (
    area: DiscardAllArea,
    confirmedPaths?: readonly string[]
  ) => {
    if (!worktreePath || !activeWorktreeId || isExecutingBulk) {
      return
    }
    const paths = confirmedPaths ? [...confirmedPaths] : getDiscardAllPaths(grouped[area], area)
    if (paths.length === 0) {
      return
    }
    setIsExecutingBulk(true)
    try {
      const connectionId = getConnectionId(activeWorktreeId) ?? undefined
      // Why: bulk unstage/discard can fail per path; aggregate those failures
      // into one toast instead of notifying once per file.
      const errors: unknown[] = []
      const result = await runDiscardAllForArea(area, paths, {
        bulkUnstage: (filePaths) =>
          bulkUnstageRuntimeGitPaths(
            {
              // Why: route unstaging by the repo OWNER host, not the focused runtime.
              settings: activeRepoSettings,
              worktreeId: activeWorktreeId,
              worktreePath,
              connectionId
            },
            filePaths
          ),
        discardMany,
        discardOne: discardSingle,
        onError: (error) => {
          errors.push(error)
          console.error('[SourceControl] discard-all failure', error)
        }
      })
      if (result.aborted) {
        toast.error(
          translate(
            'auto.components.right.sidebar.SourceControl.a5e5a11090',
            'Discard all failed — unable to unstage files before discard'
          ),
          {
            description: errors[0] instanceof Error ? errors[0].message : undefined
          }
        )
      } else if (result.failed.length > 0) {
        // Why: cap bulk-failure detail at the first error so the toast remains
        // useful when many paths fail.
        const firstMsg = errors[0] instanceof Error ? errors[0].message : undefined
        const sample = result.failed.slice(0, 3).join(', ')
        const more = result.failed.length > 3 ? `, +${result.failed.length - 3} more` : ''
        toast.error(
          translate(
            'auto.components.right.sidebar.SourceControl.8eb3782a0c',
            'Failed to discard {{value0}} file{{value1}}',
            { value0: result.failed.length, value1: result.failed.length === 1 ? '' : 's' }
          ),
          {
            description: firstMsg
              ? translate(
                  'auto.components.right.sidebar.SourceControl.dc5a6465fc',
                  '{{value0}} (e.g. {{value1}}{{value2}})',
                  { value0: firstMsg, value1: sample, value2: more }
                )
              : `${sample}${more}`
          }
        )
      }
      if (!result.aborted) {
        await refreshActiveGitStatusAfterMutation()
      }
    } finally {
      setIsExecutingBulk(false)
    }
  }
  const requestDiscardAllInArea = (
    area: DiscardAllArea,
    confirmedPaths?: readonly string[]
  ): void => {
    if (!worktreePath || !activeWorktreeId || isExecutingBulk) {
      return
    }
    const paths = confirmedPaths ? [...confirmedPaths] : getDiscardAllPaths(grouped[area], area)
    if (paths.length === 0) {
      return
    }
    setPendingDiscard({ kind: 'area', area, paths })
  }
  const requestDiscardEntry = (entry: GitStatusEntry): void => {
    if (!worktreePath || !activeWorktreeId || isExecutingBulk) {
      return
    }
    setPendingDiscard({ kind: 'entry', entry })
  }
  const confirmPendingDiscard = (): void => {
    const pending = pendingDiscard
    if (!pending) {
      return
    }
    setPendingDiscard(null)
    if (pending.kind === 'entry') {
      void handleDiscard(pending.entry.path)
      return
    }
    void handleRevertAllInArea(pending.area, pending.paths)
  }
  return {
    ...scope,
    handleUnstage,
    discardSingle,
    discardMany,
    handleDiscard,
    handleRevertAllInArea,
    requestDiscardAllInArea,
    requestDiscardEntry,
    confirmPendingDiscard
  }
}

import type { GitHistoryItem } from '@yiru/protocol/git/history-types'
import { useState } from 'react'
import { toast } from 'sonner'
import type { WebLinkMouseEvent } from '~renderer/browser/link-gesture'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionId } from '~renderer/runtime/connection-context'
import type { RuntimeGitContext } from '~renderer/runtime/git-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { useConfirmationDialog } from '~renderer/ui/confirmation-dialog'

import type { GitHistoryCommitAction } from '../git-history-commit-context-menu'
import {
  describeGitGraphCommitWrite,
  EMPTY_GIT_GRAPH_COMMIT_WRITE_FORM,
  type GitGraphCommitAction,
  type GitGraphCommitWriteAction,
  type GitGraphCommitWriteForm,
  type GitGraphCommitWritePrompt,
  isGitGraphCommitWriteAction
} from './commit-write-action'
import { runGitGraphCommitWrite } from './commit-write-run'

export type GitGraphCommitWriteDialogState = {
  action: GitGraphCommitWriteAction
  item: GitHistoryItem
  prompt: GitGraphCommitWritePrompt
}

type GitGraphCommitWriteActions = {
  handleCommitAction: (
    action: GitGraphCommitAction,
    item: GitHistoryItem,
    event?: WebLinkMouseEvent
  ) => void
  writeDialog: GitGraphCommitWriteDialogState | null
  isWriting: boolean
  closeWriteDialog: () => void
  submitWriteDialog: (form: GitGraphCommitWriteForm) => void
}

// Ref-moving and history-rewriting commit actions: confirm (or collect
// options), run the op against the repo owner host, report the outcome, then
// refresh the graph. Read-only actions fall through to `onReadAction`.
export function useGitGraphCommitWriteActions({
  worktreeId,
  worktreePath,
  activeRepoSettings,
  onReadAction
}: {
  worktreeId: string
  worktreePath: string | null
  activeRepoSettings: RuntimeGitContext['settings']
  onReadAction: (
    action: GitHistoryCommitAction,
    item: GitHistoryItem,
    event?: WebLinkMouseEvent
  ) => void
}): GitGraphCommitWriteActions {
  const confirmAction = useConfirmationDialog()
  const [writeDialog, setWriteDialog] = useState<GitGraphCommitWriteDialogState | null>(null)
  const [isWriting, setIsWriting] = useState(false)

  const runAction = async (
    action: GitGraphCommitWriteAction,
    item: GitHistoryItem,
    form: GitGraphCommitWriteForm
  ): Promise<void> => {
    if (!worktreePath) {
      return
    }
    setIsWriting(true)
    try {
      const outcome = await runGitGraphCommitWrite(
        {
          // Why: route the write by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId,
          worktreePath,
          connectionId: getConnectionId(worktreeId) ?? undefined
        },
        action,
        item,
        form
      )
      switch (outcome.status) {
        case 'ok':
          toast.success(outcome.message)
          break
        case 'conflicts':
          toast.warning(
            translate(
              'auto.components.workspace-panel.git-graph.CommitWriteActions.conflicts',
              'Stopped with conflicts — resolve them in Source Control'
            ),
            { description: outcome.paths.join(', ') }
          )
          break
        case 'blocked':
          toast.error(outcome.message)
          break
        case 'error':
          toast.error(
            translate(
              'auto.components.workspace-panel.git-graph.CommitWriteActions.failed',
              'Git command failed'
            ),
            { description: outcome.message }
          )
          break
      }
    } catch (error) {
      toast.error(
        translate(
          'auto.components.workspace-panel.git-graph.CommitWriteActions.failed',
          'Git command failed'
        ),
        { description: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setIsWriting(false)
      setWriteDialog(null)
      void useAppStore.getState().refreshGitGraph(worktreeId)
    }
  }

  const startWriteAction = async (
    action: GitGraphCommitWriteAction,
    item: GitHistoryItem
  ): Promise<void> => {
    const prompt = describeGitGraphCommitWrite(action, item)
    if (prompt.fields.length > 0) {
      setWriteDialog({ action, item, prompt })
      return
    }
    const confirmed = await confirmAction({
      title: prompt.title,
      description: prompt.description,
      confirmLabel: prompt.confirmLabel,
      confirmVariant: prompt.destructive ? 'destructive' : 'default'
    })
    if (confirmed) {
      await runAction(action, item, EMPTY_GIT_GRAPH_COMMIT_WRITE_FORM)
    }
  }

  const copyCommitSubject = async (item: GitHistoryItem): Promise<void> => {
    try {
      await shellClient.ui.writeClipboardText(item.subject)
      toast.success(
        translate(
          'auto.components.workspace-panel.git-graph.CommitWriteActions.subjectCopied',
          'Commit subject copied'
        )
      )
    } catch {
      toast.error(
        translate(
          'auto.components.workspace-panel.git-graph.CommitWriteActions.subjectCopyFailed',
          'Failed to copy commit subject'
        )
      )
    }
  }

  const handleCommitAction = (
    action: GitGraphCommitAction,
    item: GitHistoryItem,
    event?: WebLinkMouseEvent
  ): void => {
    if (isGitGraphCommitWriteAction(action)) {
      void startWriteAction(action, item)
      return
    }
    if (action === 'copy-subject') {
      void copyCommitSubject(item)
      return
    }
    onReadAction(action, item, event)
  }

  const submitWriteDialog = (form: GitGraphCommitWriteForm): void => {
    if (writeDialog) {
      void runAction(writeDialog.action, writeDialog.item, form)
    }
  }

  const closeWriteDialog = () => setWriteDialog(null)

  return { handleCommitAction, writeDialog, isWriting, closeWriteDialog, submitWriteDialog }
}

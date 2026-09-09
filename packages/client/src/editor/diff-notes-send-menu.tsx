import type { DiffComment } from '@yiru/protocol/git/diff-review'
import React from 'react'
import { formatDiffComments } from '~renderer/editor/diff-comments-format'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'

import { NotesSendMenu } from './notes-send-menu'

// Why: a request missed during navigation must not reopen on a later remount.
const OPEN_REQUEST_TTL_MS = 5000

export function DiffNotesSendMenu({
  worktreeId,
  groupId,
  comments,
  filePath,
  showFileScope = false,
  triggerClassName,
  triggerLabel,
  triggerCount,
  actionLabel,
  iconClassName = 'size-3.5',
  align = 'end',
  respondToOpenRequest = false
}: {
  worktreeId: string
  groupId: string
  comments: readonly DiffComment[]
  filePath?: string
  showFileScope?: boolean
  triggerClassName?: string
  triggerLabel?: string
  triggerCount?: number
  actionLabel?: string
  iconClassName?: string
  align?: 'start' | 'center' | 'end'
  /** Enable on exactly one notes menu per worktree. */
  respondToOpenRequest?: boolean
}): React.JSX.Element {
  const clearDeliveredDiffComments = useAppStore((s) => s.clearDeliveredDiffComments)
  const openRequest = useAppStore((s) => s.diffNotesSendMenuOpenRequest)
  const consumeOpenRequest = useAppStore((s) => s.consumeDiffNotesSendMenuOpenRequest)
  const [mountedAt] = React.useState(() => Date.now())
  const openRequestNonce =
    respondToOpenRequest &&
    openRequest?.worktreeId === worktreeId &&
    mountedAt - openRequest.issuedAt < OPEN_REQUEST_TTL_MS
      ? openRequest.nonce
      : null
  const handleOpenRequestHandled = () => consumeOpenRequest(worktreeId)
  const unsentNotes = (() => comments.filter((comment) => !comment.sentAt))()
  const unsentPrompt = (() => formatDiffComments(unsentNotes))()
  const fileNotes = (() =>
    filePath ? comments.filter((comment) => comment.filePath === filePath) : [])()
  const unsentFileNotes = (() => fileNotes.filter((comment) => !comment.sentAt))()
  const unsentFilePrompt = (() => formatDiffComments(unsentFileNotes))()
  const canSendFileScope = showFileScope && Boolean(filePath)
  const scopes = (() => {
    const allNotesScope = {
      id: 'all',
      label: translate('auto.components.editor.DiffNotesSendMenu.8b87612461', 'All unsent notes'),
      notes: unsentNotes,
      prompt: unsentPrompt
    }
    if (!canSendFileScope) {
      return [allNotesScope]
    }
    return [
      {
        id: 'file',
        label: translate('auto.components.editor.DiffNotesSendMenu.f1aa04b5cf', 'This file'),
        notes: unsentFileNotes,
        prompt: unsentFilePrompt
      },
      allNotesScope
    ]
  })()

  return (
    <NotesSendMenu
      worktreeId={worktreeId}
      groupId={groupId}
      modeIdParts={['diff-notes', worktreeId, groupId, filePath ?? 'all']}
      scopes={scopes}
      // Why: file-scoped menus should not broaden delivery before the user
      // intentionally hovers the "All unsent notes" submenu.
      defaultScopeId={canSendFileScope ? 'file' : 'all'}
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
      triggerCount={triggerCount}
      actionLabel={actionLabel}
      iconClassName={iconClassName}
      align={align}
      openRequestNonce={openRequestNonce}
      onOpenRequestHandled={handleOpenRequestHandled}
      onDelivered={(notes) => void clearDeliveredDiffComments(worktreeId, notes)}
    />
  )
}

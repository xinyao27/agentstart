import type { DecoratedDiffComment } from '~renderer/diff-comments/decorated-diff-comment'
import { DiffCommentCard } from '~renderer/diff-comments/diff-comment-card'
import { getDiffCommentLineLabel } from '~renderer/editor/diff-comment-compat'
import { formatDiffComments } from '~renderer/editor/diff-comments-format'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'

import { NotesSendMenu } from './notes-send-menu'

export function PierreDiffCommentAnnotation({
  comment,
  relativePath,
  worktreeId,
  onDeleteComment,
  onUpdateComment
}: {
  comment: DecoratedDiffComment
  relativePath: string
  worktreeId?: string
  onDeleteComment?: (commentId: string) => void
  onUpdateComment?: (commentId: string, body: string) => Promise<boolean>
}): React.JSX.Element {
  const clearDeliveredDiffComments = useAppStore((state) => state.clearDeliveredDiffComments)
  const activeGroupId = useAppStore((state) =>
    worktreeId ? (state.activeGroupIdByWorktree[worktreeId] ?? worktreeId) : ''
  )

  return (
    <div data-agentstart-diff-comment-id={comment.id}>
      <DiffCommentCard
        lineNumber={comment.lineNumber}
        startLine={comment.startLine}
        label={comment.author ? getDiffCommentLineLabel(comment).toLowerCase() : undefined}
        body={comment.body}
        sentAt={comment.sentAt}
        author={comment.author}
        createdAtLabel={comment.createdAtLabel}
        url={comment.url}
        onDelete={
          comment.canDelete === false || !onDeleteComment
            ? undefined
            : () => onDeleteComment(comment.id)
        }
        onSubmitEdit={
          comment.canEdit === false || !onUpdateComment
            ? undefined
            : (body) => onUpdateComment(comment.id, body)
        }
        headerActions={
          worktreeId && comment.author === undefined ? (
            <NotesSendMenu
              worktreeId={worktreeId}
              groupId={activeGroupId}
              modeIdParts={['diff-comment-note', worktreeId, relativePath, comment.id]}
              scopes={[
                {
                  id: 'note',
                  label: translate(
                    'auto.components.diff.comments.useDiffCommentDecorator.995fa28b50',
                    'This note'
                  ),
                  notes: comment.sentAt ? [] : [comment],
                  prompt: formatDiffComments([comment])
                }
              ]}
              targetModeLabel="This note"
              triggerClassName="agentstart-diff-comment-edit"
              disabledTooltip="Note already sent"
              onDelivered={(notes) => void clearDeliveredDiffComments(worktreeId, notes)}
            />
          ) : null
        }
      />
    </div>
  )
}

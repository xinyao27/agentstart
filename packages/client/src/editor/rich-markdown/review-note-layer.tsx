import type { DiffComment } from '@agentstart/protocol/git/diff-review'
import { DiffCommentCard } from '~renderer/diff-comments/diff-comment-card'
import { translate } from '~renderer/i18n/i18n'
import { Check, Copy } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import {
  formatMarkdownReviewNotes,
  getMarkdownReviewCardQuote,
  type MarkdownReviewNote
} from '../markdown-review-notes'
import { NotesSendMenu } from '../notes-send-menu'
import type { RichMarkdownReviewNotePosition } from './review-note-layout'

function isRichMarkdownReviewNoteNavigationClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return !target.closest('button,input,textarea,select,a,[contenteditable="true"]')
}

type RichMarkdownReviewNoteLayerProps = {
  positions: RichMarkdownReviewNotePosition[]
  activeCommentId: string | null
  attentionCommentId: string | null
  copiedCommentId: string | null
  markdownReviewContent: string
  worktreeId: string
  filePath: string
  onCopyNote: (note: MarkdownReviewNote) => void
  onScrollSourceIntoView: (comment: DiffComment) => void
  onDeleteComment: (commentId: string) => void
  onSubmitEdit: (commentId: string, body: string) => Promise<boolean>
  onContentResize: () => void
  onDelivered: (notes: readonly MarkdownReviewNote[]) => void
}

export function RichMarkdownReviewNoteLayer({
  positions,
  activeCommentId,
  attentionCommentId,
  copiedCommentId,
  markdownReviewContent,
  worktreeId,
  filePath,
  onCopyNote,
  onScrollSourceIntoView,
  onDeleteComment,
  onSubmitEdit,
  onContentResize,
  onDelivered
}: RichMarkdownReviewNoteLayerProps): React.JSX.Element {
  return (
    <div
      // Why: the review-rail's note cards reserve room via the review-rail-
      // expanded coupling in rich-markdown-content.css; this layer's own box
      // model is plain Tailwind.
      className="pointer-events-none absolute top-0 right-4 z-30 w-[clamp(220px,24%,250px)]"
      aria-label={translate(
        'auto.components.editor.RichMarkdownReviewNoteLayer.3ababd949d',
        'Review notes'
      )}
    >
      {positions.map(({ comment, top }) => (
        <div
          key={comment.id}
          data-rich-markdown-review-note-id={comment.id}
          // Why: `rich-markdown-review-note-card` plus `is-active`/`is-attention`
          // stay stable hooks for the highlight/attention treatment painted on
          // the nested `.agentstart-diff-comment-card` in rich-markdown-content.css —
          // DiffCommentCard is a separate component with no shared JSX here.
          className={cn(
            'rich-markdown-review-note-card absolute right-0 w-full pointer-events-auto',
            activeCommentId === comment.id && 'is-active',
            attentionCommentId === comment.id && 'is-attention'
          )}
          style={{ top }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            if (!isRichMarkdownReviewNoteNavigationClick(event.target)) {
              return
            }
            onScrollSourceIntoView(comment)
          }}
        >
          <DiffCommentCard
            lineNumber={comment.lineNumber}
            startLine={comment.startLine}
            label={null}
            quote={getMarkdownReviewCardQuote(markdownReviewContent, comment)}
            body={comment.body}
            sentAt={comment.sentAt}
            onDelete={() => onDeleteComment(comment.id)}
            onSubmitEdit={(body) => onSubmitEdit(comment.id, body)}
            onContentResize={onContentResize}
            headerActions={
              <>
                <Button
                  variant="quiet"
                  size="xs"
                  type="button"
                  className="bg-background inline-flex h-[26px] w-[26px] items-center justify-center border border-[color-mix(in_srgb,var(--border)_76%,transparent)] p-0 disabled:cursor-default disabled:opacity-45"
                  title={
                    copiedCommentId === comment.id
                      ? translate(
                          'auto.components.editor.RichMarkdownReviewNoteLayer.117432e2c6',
                          'Copied note'
                        )
                      : translate(
                          'auto.components.editor.RichMarkdownReviewNoteLayer.9cde7ad994',
                          'Copy note for agent'
                        )
                  }
                  aria-label={
                    copiedCommentId === comment.id
                      ? translate(
                          'auto.components.editor.RichMarkdownReviewNoteLayer.117432e2c6',
                          'Copied note'
                        )
                      : translate(
                          'auto.components.editor.RichMarkdownReviewNoteLayer.9cde7ad994',
                          'Copy note for agent'
                        )
                  }
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onCopyNote(comment as MarkdownReviewNote)
                  }}
                >
                  {copiedCommentId === comment.id ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
                <NotesSendMenu
                  worktreeId={worktreeId}
                  groupId={worktreeId}
                  modeIdParts={['markdown-notes', worktreeId, filePath, 'note', comment.id]}
                  scopes={[
                    {
                      id: 'note',
                      label: translate(
                        'auto.components.editor.RichMarkdownReviewNoteLayer.f3ef92952b',
                        'This note'
                      ),
                      notes: comment.sentAt ? [] : [comment as MarkdownReviewNote],
                      prompt: formatMarkdownReviewNotes(
                        [comment as MarkdownReviewNote],
                        markdownReviewContent
                      )
                    }
                  ]}
                  targetModeLabel="This note"
                  triggerClassName="inline-flex h-[26px] w-[26px] items-center justify-center border border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-background p-0 disabled:cursor-default disabled:opacity-45"
                  disabledTooltip="Note already sent"
                  onDelivered={onDelivered}
                />
              </>
            }
          />
        </div>
      ))}
    </div>
  )
}

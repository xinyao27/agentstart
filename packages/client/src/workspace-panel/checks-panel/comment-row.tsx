import type { PRComment } from '@yiru/protocol/hosted-review/review-types'
import React, { useState } from 'react'
import { useNow } from '~renderer/dashboard/use-now'
import { translate } from '~renderer/i18n/i18n'
import CommentMarkdown from '~renderer/sidebar/comment-markdown'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Textarea } from '~renderer/ui/textarea'

import type { PRCommentGroupActionState } from '../pr-comment-action-state'
import { isBotPRComment } from '../pr-comment-audience'
import type { PRCommentPresentationClasses } from '../pr-comment-presentation'
import { formatPrCommentRelativeTime } from '../pr-comment-time'
import {
  buildCopyText,
  CommentMoreMenu,
  CopyButton,
  formatLineRange,
  isMutablePRConversationComment,
  PRCommentActionBadge,
  QueueForAgentButton,
  ResolveButton
} from './comment-actions'

export function CommentRow({
  comment,
  botAuthorOverrides,
  isReply,
  showResolve,
  showReply,
  selectionControl,
  actionState,
  isQueued,
  replyDisabled,
  replyDisabledReason,
  presentation,
  onResolve,
  onReply,
  onEditComment,
  onDeleteComment,
  onQueueForAgent
}: {
  comment: PRComment
  botAuthorOverrides: ReadonlySet<string>
  isReply: boolean
  showResolve: boolean
  showReply?: boolean
  selectionControl?: React.ReactNode
  actionState: PRCommentGroupActionState
  isQueued: boolean
  replyDisabled?: boolean
  replyDisabledReason?: string
  presentation: PRCommentPresentationClasses
  onResolve?: (threadId: string, resolve: boolean) => boolean | Promise<boolean>
  onReply?: (comment: PRComment) => void
  onEditComment?: (comment: PRComment, body: string) => Promise<boolean>
  onDeleteComment?: (comment: PRComment) => void | Promise<void>
  onQueueForAgent?: () => void
}): React.JSX.Element {
  const automated = isBotPRComment(comment, botAuthorOverrides)
  const canMutateComment = isMutablePRConversationComment(comment)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [submittingEdit, setSubmittingEdit] = useState(false)

  const handleStartEdit = (): void => {
    setDraft(comment.body)
    setEditing(true)
  }

  const handleCancelEdit = (event: React.MouseEvent): void => {
    event.stopPropagation()
    setEditing(false)
    setDraft(comment.body)
  }

  const handleSaveEdit = async (event: React.MouseEvent): Promise<void> => {
    event.stopPropagation()
    const trimmedDraft = draft.trim()
    if (!onEditComment || !trimmedDraft || trimmedDraft === comment.body) {
      setEditing(false)
      return
    }
    setSubmittingEdit(true)
    try {
      const ok = await onEditComment(comment, trimmedDraft)
      if (ok) {
        setEditing(false)
      }
    } finally {
      setSubmittingEdit(false)
    }
  }

  const handleDelete = (): void => {
    void onDeleteComment?.(comment)
  }

  const trimmedDraft = draft.trim()
  const canSaveEdit = !submittingEdit && trimmedDraft.length > 0 && trimmedDraft !== comment.body
  const relativeTime = formatPrCommentRelativeTime(comment.createdAt, useNow(30_000))

  const authorAvatar = comment.authorAvatarUrl ? (
    <img
      src={comment.authorAvatarUrl}
      alt={comment.author}
      className={cn(isReply ? presentation.avatarReply : presentation.avatar)}
    />
  ) : (
    <div className={cn(isReply ? presentation.avatarReply : presentation.avatar)} aria-hidden />
  )

  const authorName = (
    <span className={cn(presentation.author, comment.isResolved && presentation.authorResolved)}>
      {comment.author}
    </span>
  )
  const queueButton =
    !isReply && onQueueForAgent ? <QueueForAgentButton onQueueForAgent={onQueueForAgent} /> : null

  const hoverActions = !editing ? (
    <div className="can-hover:opacity-0 flex items-center gap-0.5 transition-opacity group-hover/comment:opacity-100">
      {showResolve &&
        comment.threadId != null &&
        onResolve &&
        (actionState === 'open' || actionState === 'resolved') && (
          <ResolveButton
            threadId={comment.threadId}
            isResolved={comment.isResolved ?? false}
            onResolve={onResolve}
          />
        )}
      {showReply && onReply && (
        <Button
          variant="quiet"
          size="xs"
          className="h-auto border-0 px-1.5 py-0.5 text-[10px] disabled:cursor-not-allowed"
          title={
            replyDisabled
              ? replyDisabledReason
              : translate('auto.components.right.sidebar.checks.panel.content.c1f6fc006a', 'Reply')
          }
          disabled={replyDisabled}
          onClick={(event) => {
            event.stopPropagation()
            onReply(comment)
          }}
        >
          {translate('auto.components.right.sidebar.checks.panel.content.c1f6fc006a', 'Reply')}
        </Button>
      )}
      <CopyButton text={buildCopyText(comment)} />
      <CommentMoreMenu
        comment={comment}
        botAuthorOverrides={botAuthorOverrides}
        onStartEdit={canMutateComment && onEditComment ? handleStartEdit : undefined}
        onDelete={canMutateComment && onDeleteComment ? handleDelete : undefined}
        onQueueForAgent={!isReply ? onQueueForAgent : undefined}
      />
    </div>
  ) : null

  const commentActions = !editing ? (
    <div className="flex shrink-0 items-center gap-0.5">
      {presentation.useCardLayout ? null : queueButton}
      {hoverActions}
    </div>
  ) : null

  const cardMetaRow =
    presentation.useCardLayout && !isReply ? (
      <div
        className={
          selectionControl
            ? presentation.commentHeaderMetaWithSelection
            : presentation.commentHeaderMeta
        }
      >
        {relativeTime ? <span>{relativeTime}</span> : null}
        {automated ? (
          <span className={presentation.botBadge}>
            {translate('auto.components.right.sidebar.checks.panel.content.2ba0a32bdd', 'bot')}
          </span>
        ) : null}
        {comment.path ? (
          <span className={presentation.pathBadge} title={comment.path}>
            {comment.path.split('/').pop()}
            {formatLineRange(comment) && `:${formatLineRange(comment)}`}
          </span>
        ) : null}
        <PRCommentActionBadge
          actionState={actionState}
          isQueued={isQueued}
          presentation={presentation}
        />
        {onQueueForAgent ? (
          <QueueForAgentButton
            className="can-hover:opacity-0 ml-auto group-focus-within/comment:opacity-100 group-hover/comment:opacity-100"
            onQueueForAgent={onQueueForAgent}
          />
        ) : null}
      </div>
    ) : null

  const authorLine =
    presentation.useCardLayout && !isReply ? (
      <>
        <div className={presentation.commentHeaderPrimary}>
          {selectionControl}
          {authorAvatar}
          {authorName}
          {commentActions}
        </div>
        {cardMetaRow}
      </>
    ) : (
      <>
        {selectionControl}
        {authorAvatar}
        {authorName}
        {relativeTime ? (
          <span className={presentation.time} aria-hidden={presentation.time === 'hidden'}>
            {presentation.useCardLayout ? `· ${relativeTime}` : relativeTime}
          </span>
        ) : null}
        {automated && (
          <span className={presentation.botBadge}>
            {translate('auto.components.right.sidebar.checks.panel.content.2ba0a32bdd', 'bot')}
          </span>
        )}
        {!isReply && comment.path && (
          <span className={presentation.pathBadge}>
            {comment.path.split('/').pop()}
            {formatLineRange(comment) && `:${formatLineRange(comment)}`}
          </span>
        )}
        {!isReply ? (
          <PRCommentActionBadge
            actionState={actionState}
            isQueued={isQueued}
            presentation={presentation}
          />
        ) : null}
        <div className="flex-1" />
        {commentActions}
      </>
    )

  return (
    <div
      className={cn(
        'group/comment min-w-0',
        presentation.commentRow,
        isReply && presentation.commentRowReply,
        comment.isResolved && presentation.resolvedContainer
      )}
    >
      <div className="min-w-0">
        <div
          className={cn(
            isReply && presentation.useCardLayout
              ? presentation.commentHeaderReply
              : presentation.commentHeader
          )}
        >
          {authorLine}
        </div>
        {editing ? (
          <div
            className={cn(
              'mt-1 flex flex-col gap-1.5',
              presentation.useCardLayout ? 'px-3 pb-3' : isReply ? 'pl-5' : 'pl-[22px]'
            )}
          >
            <Textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              className="border-border bg-background text-foreground focus-visible:border-ring min-h-[60px] w-full resize-y border px-2 py-1.5 text-[11px] leading-snug outline-none"
            />
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={submittingEdit}
                onClick={handleCancelEdit}
              >
                {translate(
                  'auto.components.right.sidebar.checks.panel.content.b062f55f29',
                  'Cancel'
                )}
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={!canSaveEdit}
                onClick={(event) => void handleSaveEdit(event)}
              >
                {translate('auto.components.right.sidebar.checks.panel.content.f6a40263ff', 'Save')}
              </Button>
            </div>
          </div>
        ) : (
          <CommentMarkdown
            content={comment.body}
            className={cn(
              isReply ? presentation.commentBodyReply : presentation.commentBody,
              presentation.commentBodyMarkdown
            )}
          />
        )}
      </div>
    </div>
  )
}

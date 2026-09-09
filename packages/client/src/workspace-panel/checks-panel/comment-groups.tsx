import type { PRComment } from '@yiru/protocol/hosted-review/review-types'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Sparkle as Sparkles } from '~renderer/icons/hugeicons'
import {
  getPRCommentGroupId,
  type PRCommentGroup
} from '~renderer/source-control/pr-comment-groups'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '~renderer/ui/accordion'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '~renderer/ui/context-menu'

import type { PRCommentGroupActionState } from '../pr-comment-action-state'
import {
  getPRCommentGroupSurfaceClasses,
  type PRCommentPresentationClasses
} from '../pr-comment-presentation'
import {
  RightPanelCommentComposer,
  type RightPanelCommentSubmitResult
} from '../right-panel-comment-composer'
import { CommentRow } from './comment-row'

export function PRCommentGroupView({
  group,
  botAuthorOverrides,
  replyingCommentId,
  selectionControl,
  actionState,
  isQueued,
  replyDisabled,
  replyDisabledReason,
  presentation,
  onResolve,
  onStartReply,
  onCancelReply,
  onReply,
  onEditComment,
  onDeleteComment,
  onQueueForAgent
}: {
  group: PRCommentGroup
  botAuthorOverrides: ReadonlySet<string>
  replyingCommentId: number | null
  selectionControl?: React.ReactNode
  actionState: PRCommentGroupActionState
  isQueued: boolean
  replyDisabled?: boolean
  replyDisabledReason?: string
  presentation: PRCommentPresentationClasses
  onResolve?: (threadId: string, resolve: boolean) => boolean | Promise<boolean>
  onStartReply?: (commentId: number) => void
  onCancelReply?: (commentId: number) => void
  onReply?: (comment: PRComment, body: string) => Promise<RightPanelCommentSubmitResult>
  onEditComment?: (comment: PRComment, body: string) => Promise<boolean>
  onDeleteComment?: (comment: PRComment) => void | Promise<void>
  onQueueForAgent?: () => void
}): React.JSX.Element {
  // Reply targets a specific comment id so any comment in a thread — root or
  // nested reply — can be replied to, not just the thread root.
  const renderReplyComposer = (comment: PRComment): React.ReactNode =>
    replyingCommentId === comment.id && onReply ? (
      <div className={cn('px-3 pb-2', group.kind === 'thread' && 'pl-6')}>
        <RightPanelCommentComposer
          placeholder={translate(
            'auto.components.right.sidebar.checks.panel.content.ba20d1a896',
            'Reply to {{value0}}',
            { value0: comment.author }
          )}
          submitLabel="Reply"
          autoFocus
          disabled={replyDisabled}
          disabledReason={replyDisabledReason}
          onCancel={() => onCancelReply?.(comment.id)}
          onSubmit={(body) => onReply(comment, body)}
        />
      </div>
    ) : null
  const startReply = onStartReply ? (comment: PRComment) => onStartReply(comment.id) : undefined
  const surfaceClassName = cn(
    getPRCommentGroupSurfaceClasses(presentation, actionState, { queued: isQueued }),
    group.kind === 'standalone' ? presentation.groupStandalone : presentation.groupThread
  )
  const sharedRowProps = {
    botAuthorOverrides,
    actionState,
    isQueued,
    replyDisabled,
    replyDisabledReason,
    presentation,
    onResolve,
    onEditComment,
    onDeleteComment,
    onQueueForAgent
  }

  const content =
    group.kind === 'standalone' ? (
      <div className={surfaceClassName} data-testid="pr-comment-group">
        <CommentRow
          comment={group.comment}
          isReply={false}
          showResolve={false}
          showReply={Boolean(onReply)}
          selectionControl={selectionControl}
          onReply={startReply}
          {...sharedRowProps}
        />
        {renderReplyComposer(group.comment)}
      </div>
    ) : (
      <div className={surfaceClassName} data-testid="pr-comment-group">
        <CommentRow
          comment={group.root}
          isReply={false}
          showResolve={true}
          showReply={Boolean(onReply)}
          selectionControl={selectionControl}
          onReply={startReply}
          {...sharedRowProps}
        />
        {renderReplyComposer(group.root)}
        {group.replies.length > 0 && (
          <div className={presentation.repliesContainer}>
            {group.replies.map((reply) => (
              <React.Fragment key={reply.id}>
                <CommentRow
                  {...sharedRowProps}
                  comment={reply}
                  isReply={true}
                  showResolve={false}
                  showReply={Boolean(onReply)}
                  isQueued={false}
                  onReply={startReply}
                />
                {renderReplyComposer(reply)}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    )

  if (!onQueueForAgent) {
    return content
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={content} />
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onQueueForAgent()}>
          <Sparkles />
          {translate(
            'auto.components.right.sidebar.checks.panel.content.f8a2c91d04',
            'Queue for agent'
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ResolvedCommentGroupsSection({
  groups,
  botAuthorOverrides,
  replyingCommentId,
  replyDisabled,
  replyDisabledReason,
  presentation,
  onResolve,
  onStartReply,
  onCancelReply,
  onReply,
  onEditComment,
  onDeleteComment
}: {
  groups: PRCommentGroup[]
  botAuthorOverrides: ReadonlySet<string>
  replyingCommentId: number | null
  replyDisabled?: boolean
  replyDisabledReason?: string
  presentation: PRCommentPresentationClasses
  onResolve?: (threadId: string, resolve: boolean) => boolean | Promise<boolean>
  onStartReply?: (commentId: number) => void
  onCancelReply?: (commentId: number) => void
  onReply?: (comment: PRComment, body: string) => Promise<RightPanelCommentSubmitResult>
  onEditComment?: (comment: PRComment, body: string) => Promise<boolean>
  onDeleteComment?: (comment: PRComment) => void | Promise<void>
}): React.JSX.Element | null {
  if (groups.length === 0) {
    return null
  }
  return (
    <div className={presentation.resolvedSection}>
      <Accordion>
        <AccordionItem value="resolved-all" className="border-b-0">
          <AccordionTrigger className={presentation.resolvedSectionTrigger}>
            <span className="min-w-0 truncate">
              {translate(
                'auto.components.right.sidebar.checks.panel.content.e8b4c1a903',
                'Resolved · {{value0}}',
                { value0: groups.length }
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className={presentation.resolvedSectionContent}>
            {groups.map((group) => (
              <PRCommentGroupView
                key={getPRCommentGroupId(group)}
                group={group}
                botAuthorOverrides={botAuthorOverrides}
                replyingCommentId={replyingCommentId}
                actionState="resolved"
                isQueued={false}
                replyDisabled={replyDisabled}
                replyDisabledReason={replyDisabledReason}
                presentation={presentation}
                onResolve={onResolve}
                onStartReply={onStartReply}
                onCancelReply={onCancelReply}
                onReply={onReply}
                onEditComment={onEditComment}
                onDeleteComment={onDeleteComment}
              />
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

import type { DiffComment } from '@agentstart/protocol/git/diff-review'
import { useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Check, Copy, Plus } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { DiffCommentCard } from '../../diff-comments/diff-comment-card'
import { copyMarkdownReviewNotesForAgent } from '../markdown-review-note-copy'
import {
  formatMarkdownReviewCardQuote,
  formatMarkdownReviewNotes,
  getMarkdownReviewCardQuote,
  sortMarkdownReviewNotes,
  type MarkdownReviewNote
} from '../markdown-review-notes'
import {
  getMarkdownPreviewAnnotationQuote,
  getMarkdownPreviewBlockRange,
  isMarkdownAnnotationNavigationClick,
  type MarkdownPreviewPositionNode
} from './annotation-model'
import { cancelMarkdownPreviewEditorRevealFrames, clearMarkdownPreviewTimeout } from './navigation'
import { MarkdownAnnotationComposer, MarkdownSingleNoteSendMenu } from './review-components'
import type {
  MarkdownBlockRange,
  MarkdownPreviewReview,
  UseMarkdownPreviewReviewOptions
} from './review-contract'

export function useMarkdownPreviewReview({
  content,
  filePath,
  markdownAnnotationsEnabled,
  markdownComments,
  pendingEditorRevealFrameIdsRef,
  renderedContent,
  rootRef,
  sourceRelativePath,
  sourceWorktree
}: UseMarkdownPreviewReviewOptions): MarkdownPreviewReview {
  const addDiffComment = useAppStore((state) => state.addDiffComment)
  const deleteDiffComment = useAppStore((state) => state.deleteDiffComment)
  const updateDiffComment = useAppStore((state) => state.updateDiffComment)
  const clearDeliveredDiffComments = useAppStore((state) => state.clearDeliveredDiffComments)
  const [activeAnnotationBlockKey, setActiveAnnotationBlockKey] = useState<string | null>(null)
  const [reviewNotesCopied, setReviewNotesCopied] = useState(false)
  const [copiedReviewNoteId, setCopiedReviewNoteId] = useState<string | null>(null)
  const [activeReviewCommentId, setActiveReviewCommentId] = useState<string | null>(null)
  const [attentionReviewCommentId, setAttentionReviewCommentId] = useState<string | null>(null)
  const reviewNotesCopiedResetTimerRef = useRef<number | null>(null)
  const copiedReviewNoteResetTimerRef = useRef<number | null>(null)
  const attentionReviewCommentTimeoutRef = useRef<number | null>(null)
  const isMountedRef = useRef(false)
  const markdownReviewNotes = sortMarkdownReviewNotes(markdownComments as MarkdownReviewNote[])
  const unsentNotes = markdownReviewNotes.filter((note) => !note.sentAt)
  const unsentReviewScope = [
    {
      id: 'all',
      label: translate('auto.components.editor.MarkdownPreview.ddf087d12e', 'All unsent notes'),
      notes: unsentNotes,
      prompt: formatMarkdownReviewNotes(unsentNotes, renderedContent)
    }
  ]

  const clearTimer = (timerRef: MutableRefObject<number | null>): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
  const setRootElement = (node: HTMLDivElement | null): void => {
    rootRef.current = node
    isMountedRef.current = node !== null
    if (!node) {
      cancelMarkdownPreviewEditorRevealFrames(pendingEditorRevealFrameIdsRef)
      clearMarkdownPreviewTimeout(attentionReviewCommentTimeoutRef)
      clearTimer(reviewNotesCopiedResetTimerRef)
      clearTimer(copiedReviewNoteResetTimerRef)
    }
  }
  const copyReviewNotes = async (): Promise<void> => {
    if (markdownReviewNotes.length === 0) {
      return
    }
    try {
      const didCopy = await copyMarkdownReviewNotesForAgent({
        notes: markdownReviewNotes,
        content: renderedContent,
        writeClipboardText: shellClient.ui.writeClipboardText
      })
      if (!didCopy || !isMountedRef.current) {
        return
      }
      clearTimer(reviewNotesCopiedResetTimerRef)
      setReviewNotesCopied(true)
      reviewNotesCopiedResetTimerRef.current = window.setTimeout(() => {
        setReviewNotesCopied(false)
        reviewNotesCopiedResetTimerRef.current = null
      }, 1600)
    } catch {
      // Why: clipboard writes are best-effort while the window is unfocused.
    }
  }
  const copyReviewNote = async (note: MarkdownReviewNote): Promise<void> => {
    try {
      const didCopy = await copyMarkdownReviewNotesForAgent({
        notes: [note],
        content: renderedContent,
        writeClipboardText: shellClient.ui.writeClipboardText
      })
      if (!didCopy || !isMountedRef.current) {
        return
      }
      clearTimer(copiedReviewNoteResetTimerRef)
      setCopiedReviewNoteId(note.id)
      copiedReviewNoteResetTimerRef.current = window.setTimeout(() => {
        setCopiedReviewNoteId(null)
        copiedReviewNoteResetTimerRef.current = null
      }, 1600)
    } catch {
      // Why: clipboard writes are best-effort while the window is unfocused.
    }
  }
  const pulseReviewNote = (commentId: string): void => {
    clearTimer(attentionReviewCommentTimeoutRef)
    setAttentionReviewCommentId(null)
    window.requestAnimationFrame(() => {
      setAttentionReviewCommentId(commentId)
      attentionReviewCommentTimeoutRef.current = window.setTimeout(() => {
        setAttentionReviewCommentId(null)
        attentionReviewCommentTimeoutRef.current = null
      }, 900)
    })
  }
  const scrollRenderedReviewNoteIntoView = (comment: DiffComment): void => {
    setActiveReviewCommentId(comment.id)
    pulseReviewNote(comment.id)
    window.requestAnimationFrame(() => {
      Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('[data-markdown-review-note-id]') ?? []
      )
        .find((candidate) => candidate.dataset.markdownReviewNoteId === comment.id)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    })
  }
  const scrollToReviewNote = (comment: DiffComment): void => {
    setActiveReviewCommentId(comment.id)
    const blocks = rootRef.current?.querySelectorAll<HTMLElement>(
      '[data-source-line][data-source-end-line]'
    )
    const target = Array.from(blocks ?? []).find((block) => {
      const startLine = Number(block.dataset.sourceLine)
      const endLine = Number(block.dataset.sourceEndLine)
      return startLine <= comment.lineNumber && comment.lineNumber <= endLine
    })
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const commentsForRange = (range: MarkdownBlockRange): DiffComment[] =>
    markdownComments.filter(
      (comment) => range.startLine <= comment.lineNumber && comment.lineNumber <= range.endLine
    )
  const handleAnnotatedMarkdownBlockClick = (
    range: MarkdownBlockRange,
    event: React.MouseEvent<HTMLElement>
  ): void => {
    if (!isMarkdownAnnotationNavigationClick(event.target)) {
      return
    }
    const comments = commentsForRange(range)
    const comment =
      comments.find((candidate) => candidate.id !== activeReviewCommentId) ?? comments[0]
    if (comment) {
      scrollRenderedReviewNoteIntoView(comment)
    }
  }

  const renderAnnotationControls = (
    range: MarkdownBlockRange,
    blockKey: string,
    annotationQuote?: string
  ): React.ReactNode => {
    if (!sourceWorktree || sourceRelativePath === null || !markdownAnnotationsEnabled) {
      return null
    }
    const comments = commentsForRange(range)
    const submit = async (body: string): Promise<boolean> => {
      const result = await addDiffComment({
        worktreeId: sourceWorktree.id,
        filePath: sourceRelativePath,
        source: 'markdown',
        startLine: range.startLine === range.endLine ? undefined : range.startLine,
        lineNumber: range.endLine,
        ...(annotationQuote ? { selectedText: annotationQuote } : {}),
        body,
        side: 'modified'
      })
      if (result) {
        setActiveAnnotationBlockKey(null)
      }
      return Boolean(result)
    }
    return (
      <div className="markdown-annotation-controls relative col-start-2 row-start-1 mt-0 min-w-0 @max-[760px]/markdown-preview:mt-1.5">
        <Button
          variant="quiet"
          size="xs"
          type="button"
          className={cn(
            'absolute top-0.5 -left-[26px] inline-flex size-5 items-center justify-center border border-border/72 bg-background outline-none transition-[opacity,color,background-color] duration-100 focus-visible:border-ring focus-visible:opacity-100 @max-[760px]/markdown-preview:static',
            comments.length > 0
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          )}
          aria-label={translate('auto.components.editor.MarkdownPreview.13f94d760c', 'Add note')}
          title={translate('auto.components.editor.MarkdownPreview.13f94d760c', 'Add note')}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setActiveAnnotationBlockKey((current) => (current === blockKey ? null : blockKey))
          }}
        >
          <Plus className="size-3" />
        </Button>
        {activeAnnotationBlockKey === blockKey ? (
          <MarkdownAnnotationComposer
            lineNumber={range.endLine}
            startLine={range.startLine === range.endLine ? undefined : range.startLine}
            onCancel={() => setActiveAnnotationBlockKey(null)}
            onSubmit={submit}
          />
        ) : null}
        <div
          className={cn(
            'flex min-w-0 flex-col gap-2 @max-[760px]/markdown-preview:mt-1.5',
            activeAnnotationBlockKey === blockKey && 'mt-2'
          )}
        >
          {comments.map((comment) => (
            <div
              key={comment.id}
              data-markdown-review-note-id={comment.id}
              className={cn(
                'markdown-annotation-card mt-0 max-w-none scroll-m-3',
                activeReviewCommentId === comment.id && 'is-active',
                attentionReviewCommentId === comment.id && 'is-attention'
              )}
            >
              <DiffCommentCard
                lineNumber={comment.lineNumber}
                startLine={comment.startLine}
                label={null}
                quote={
                  formatMarkdownReviewCardQuote(comment.selectedText) ??
                  annotationQuote ??
                  getMarkdownReviewCardQuote(content, comment)
                }
                body={comment.body}
                sentAt={comment.sentAt}
                onDelete={() => void deleteDiffComment(sourceWorktree.id, comment.id)}
                onSubmitEdit={(body) => updateDiffComment(sourceWorktree.id, comment.id, body)}
                headerActions={
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      type="button"
                      className="agentstart-diff-comment-pill-btn focus-visible:bg-accent h-auto border-0 p-0"
                      title={
                        copiedReviewNoteId === comment.id
                          ? translate(
                              'auto.components.editor.MarkdownPreview.94b520a96a',
                              'Copied note'
                            )
                          : translate(
                              'auto.components.editor.MarkdownPreview.f961e94057',
                              'Copy note for agent'
                            )
                      }
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void copyReviewNote(comment as MarkdownReviewNote)
                      }}
                    >
                      {copiedReviewNoteId === comment.id ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                    <MarkdownSingleNoteSendMenu
                      worktreeId={sourceWorktree.id}
                      filePath={filePath}
                      content={renderedContent}
                      note={comment as MarkdownReviewNote}
                      modeSlot="preview-inline"
                      onDelivered={(notes) =>
                        void clearDeliveredDiffComments(sourceWorktree.id, notes)
                      }
                    />
                  </>
                }
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const wrapAnnotatedBlock = (
    tagName: string,
    node: MarkdownPreviewPositionNode | undefined,
    rendered: React.ReactNode
  ): React.ReactNode => {
    const range = getMarkdownPreviewBlockRange(node)
    if (!range) {
      return rendered
    }
    const blockKey = `${tagName}:${range.startLine}-${range.endLine}`
    const controls = renderAnnotationControls(
      range,
      blockKey,
      getMarkdownPreviewAnnotationQuote(rendered)
    )
    if (!controls) {
      return rendered
    }
    return (
      <div
        className="markdown-annotation-block group relative grid grid-cols-[minmax(0,1fr)_minmax(220px,min(28cqw,300px))] items-start gap-x-8 @max-[760px]/markdown-preview:block [&>*:first-child]:min-w-0"
        data-source-line={range.startLine}
        data-source-end-line={range.endLine}
        data-annotation-block-key={blockKey}
        onClick={(event) => handleAnnotatedMarkdownBlockClick(range, event)}
      >
        {rendered}
        {controls}
      </div>
    )
  }

  const bodyRevision = [
    content,
    markdownAnnotationsEnabled ? 'annotations' : 'plain',
    markdownComments
      .map((comment) =>
        [
          comment.id,
          comment.body,
          comment.lineNumber,
          comment.startLine ?? '',
          comment.sentAt ?? ''
        ].join(':')
      )
      .join('\0'),
    sourceRelativePath,
    sourceWorktree?.id ?? '',
    activeAnnotationBlockKey,
    activeReviewCommentId,
    attentionReviewCommentId,
    copiedReviewNoteId
  ].join('\u0001')

  return {
    bodyRevision,
    canShowReviewTools: Boolean(
      markdownAnnotationsEnabled && sourceWorktree && sourceRelativePath !== null
    ),
    copyReviewNotes,
    handleAnnotatedMarkdownBlockClick,
    markdownReviewNotes,
    onDelivered: (notes) => {
      if (sourceWorktree) {
        void clearDeliveredDiffComments(sourceWorktree.id, notes)
      }
    },
    openAnnotationBlock: setActiveAnnotationBlockKey,
    renderAnnotationControls,
    reviewNotesCopied,
    scrollToReviewNote,
    setRootElement,
    unsentReviewScope,
    wrapAnnotatedBlock
  }
}

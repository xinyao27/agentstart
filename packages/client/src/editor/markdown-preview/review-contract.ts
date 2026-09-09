import type { DiffComment } from '@yiru/protocol/git/diff-review'
import type { Worktree } from '@yiru/protocol/worktree/model'
import type { MutableRefObject, RefObject } from 'react'

import type { MarkdownReviewNote } from '../markdown-review-notes'
import type { MarkdownPreviewPositionNode } from './annotation-model'

export type MarkdownBlockRange = { startLine: number; endLine: number }

export type UseMarkdownPreviewReviewOptions = {
  content: string
  filePath: string
  markdownAnnotationsEnabled: boolean
  markdownComments: DiffComment[]
  pendingEditorRevealFrameIdsRef: MutableRefObject<number[]>
  renderedContent: string
  rootRef: RefObject<HTMLDivElement | null>
  sourceRelativePath: string | null
  sourceWorktree: Worktree | null
}

export type MarkdownPreviewReview = {
  bodyRevision: string
  canShowReviewTools: boolean
  copyReviewNotes: () => Promise<void>
  handleAnnotatedMarkdownBlockClick: (
    range: MarkdownBlockRange,
    event: React.MouseEvent<HTMLElement>
  ) => void
  markdownReviewNotes: MarkdownReviewNote[]
  onDelivered: (notes: readonly MarkdownReviewNote[]) => void
  openAnnotationBlock: (blockKey: string) => void
  renderAnnotationControls: (
    range: MarkdownBlockRange,
    blockKey: string,
    annotationQuote?: string
  ) => React.ReactNode
  reviewNotesCopied: boolean
  scrollToReviewNote: (comment: DiffComment) => void
  setRootElement: (node: HTMLDivElement | null) => void
  unsentReviewScope: {
    id: string
    label: string
    notes: MarkdownReviewNote[]
    prompt: string
  }[]
  wrapAnnotatedBlock: (
    tagName: string,
    node: MarkdownPreviewPositionNode | undefined,
    rendered: React.ReactNode
  ) => React.ReactNode
}

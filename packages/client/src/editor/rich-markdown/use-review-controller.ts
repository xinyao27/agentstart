import type { DiffComment } from '@agentstart/protocol/git/diff-review'
import type { Editor } from '@tiptap/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import type { AppState } from '~renderer/store/state'

import { richMarkdownAnnotationHighlightPluginKey } from './annotation-highlight'
import { updateRichMarkdownAnnotationHighlightsAfterSubmit } from './annotation-submit-highlights'
import {
  clampRichMarkdownAnnotationTarget,
  getRichMarkdownAnnotationTarget,
  hasRichMarkdownCommentForRange,
  type RichMarkdownAnnotationTarget
} from './review-annotations'
import { shouldExpandRichMarkdownReviewRail } from './review-note-layout'
import { useRichMarkdownReviewCopyFeedback } from './use-review-copy-feedback'
import { useRichMarkdownReviewData } from './use-review-data'
import { useRichMarkdownReviewRailController } from './use-review-rail-controller'

type UseRichMarkdownReviewControllerOptions = {
  addDiffComment: AppState['addDiffComment']
  allDiffComments: DiffComment[] | undefined
  content: string
  editorRef: MutableRefObject<Editor | null>
  filePath: string
  markdownAnnotationFilePath?: string
  markdownAnnotationsEnabled: boolean
  markdownReviewContent: string
  markdownSourceLineOffset: number
  rootRef: MutableRefObject<HTMLDivElement | null>
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>
  worktreeId: string
  worktreeRoot: string | null
}

export function useRichMarkdownReviewController({
  addDiffComment,
  allDiffComments,
  content,
  editorRef,
  filePath,
  markdownAnnotationFilePath,
  markdownAnnotationsEnabled,
  markdownReviewContent,
  markdownSourceLineOffset,
  rootRef,
  scrollContainerRef,
  worktreeId,
  worktreeRoot
}: UseRichMarkdownReviewControllerOptions) {
  const [storedAnnotationTarget, setAnnotationTarget] =
    useState<RichMarkdownAnnotationTarget | null>(null)
  const [storedAnnotationPopover, setAnnotationPopover] =
    useState<RichMarkdownAnnotationTarget | null>(null)
  const annotationPopoverRef = useRef<RichMarkdownAnnotationTarget | null>(null)
  const canAnnotateRichMarkdownRef = useRef(false)
  const markdownCommentsRef = useRef<DiffComment[]>([])
  const markdownSourceLineOffsetRef = useRef(markdownSourceLineOffset)
  const annotationTargetFrameRef = useRef<number | null>(null)
  const {
    canAnnotateRichMarkdown,
    markdownComments,
    markdownReviewNotes,
    sourceRelativePath,
    unsentMarkdownReviewScope
  } = useRichMarkdownReviewData({
    allDiffComments,
    filePath,
    markdownAnnotationFilePath,
    markdownAnnotationsEnabled,
    markdownReviewContent,
    worktreeRoot
  })
  const annotationTarget = canAnnotateRichMarkdown ? storedAnnotationTarget : null
  const annotationPopover = canAnnotateRichMarkdown ? storedAnnotationPopover : null

  useLayoutEffect(() => {
    annotationPopoverRef.current = annotationPopover
    canAnnotateRichMarkdownRef.current = canAnnotateRichMarkdown
    markdownCommentsRef.current = markdownComments
    markdownSourceLineOffsetRef.current = markdownSourceLineOffset
  })

  const copyFeedback = useRichMarkdownReviewCopyFeedback({
    markdownReviewContent,
    markdownReviewNotes,
    rootRef
  })
  const { clearReviewCopyTimers } = copyFeedback
  const rail = useRichMarkdownReviewRailController({
    canAnnotateRichMarkdown,
    content,
    editorRef,
    markdownComments,
    markdownSourceLineOffset,
    markdownSourceLineOffsetRef,
    scrollContainerRef
  })
  const { cancelNotePositionFrame, clearAttentionTimers, setReviewRailOpen } = rail
  const reviewRailExpanded = shouldExpandRichMarkdownReviewRail({
    hasReviewNotes: markdownComments.length > 0,
    reviewRailOpen: rail.reviewRailOpen,
    hasDraftNote: annotationPopover !== null
  })

  const clearAllAnnotationHighlights = useEventCallback((): void => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    editor.view.dispatch(
      editor.state.tr.setMeta(richMarkdownAnnotationHighlightPluginKey, {
        activeRange: null,
        noteRanges: []
      })
    )
  })

  const clearAnnotationHighlight = (): void => {
    const editor = editorRef.current
    editor?.view.dispatch(editor.state.tr.setMeta(richMarkdownAnnotationHighlightPluginKey, null))
  }

  const clearAnnotationTarget = (): void => setAnnotationTarget(null)

  const clearTransientReviewState = (): void => {
    clearAttentionTimers()
    clearReviewCopyTimers()
    clearAllAnnotationHighlights()
    cancelFrame(annotationTargetFrameRef)
    cancelNotePositionFrame()
  }

  const syncAnnotationTarget = (editor: Editor): void => {
    cancelFrame(annotationTargetFrameRef)
    annotationTargetFrameRef.current = window.requestAnimationFrame(() => {
      annotationTargetFrameRef.current = null
      const root = rootRef.current
      if (!root || annotationPopoverRef.current || !canAnnotateRichMarkdownRef.current) {
        setAnnotationTarget(null)
        return
      }
      const target = getRichMarkdownAnnotationTarget(editor, root)
      const hasExistingComment =
        target &&
        hasRichMarkdownCommentForRange(
          markdownCommentsRef.current,
          target,
          markdownSourceLineOffsetRef.current
        )
      setAnnotationTarget(hasExistingComment ? null : target)
    })
  }

  const submitAnnotation = async (body: string): Promise<void> => {
    if (!annotationPopover || sourceRelativePath === null) {
      return
    }
    const result = await addDiffComment({
      worktreeId,
      filePath: sourceRelativePath,
      source: 'markdown',
      startLine:
        annotationPopover.startLine === undefined
          ? undefined
          : annotationPopover.startLine + markdownSourceLineOffset,
      lineNumber: annotationPopover.lineNumber + markdownSourceLineOffset,
      selectedText: annotationPopover.selectedText,
      body,
      side: 'modified'
    })
    if (!result) {
      console.error('Failed to add markdown comment — draft preserved')
      return
    }
    updateRichMarkdownAnnotationHighlightsAfterSubmit({
      annotationPopover,
      comments: [...markdownComments, result],
      editor: editorRef.current,
      markdownSourceLineOffset
    })
    setAnnotationPopover(null)
    clearAnnotationHighlight()
    window.getSelection()?.removeAllRanges()
  }

  // Why: reports whether a composer actually opened so keyboard callers can
  // leave the chord unconsumed when this no-ops (mouse callers ignore it).
  const openAnnotationPopover = (requireLiveSelection = false): boolean => {
    if (!canAnnotateRichMarkdown) {
      return false
    }
    const editor = editorRef.current
    const root = rootRef.current
    // Why: keyboard callers require the live selection to avoid stale-target
    // races; the mouse button may use the target from the render that exposed it.
    const liveTarget = editor && root ? getRichMarkdownAnnotationTarget(editor, root) : null
    const baseTarget = liveTarget ?? (requireLiveSelection ? null : annotationTarget)
    if (!baseTarget) {
      return false
    }
    const target = editor ? clampRichMarkdownAnnotationTarget(editor, baseTarget) : baseTarget
    if (
      !target ||
      hasRichMarkdownCommentForRange(markdownComments, target, markdownSourceLineOffset)
    ) {
      setAnnotationTarget(null)
      return false
    }
    editor?.view.dispatch(
      editor.state.tr.setMeta(richMarkdownAnnotationHighlightPluginKey, {
        activeRange: { from: target.from, to: target.to }
      })
    )
    // Why: opening a draft should reserve the notes rail immediately; saved notes stay visible.
    setReviewRailOpen(true)
    setAnnotationPopover(target)
    setAnnotationTarget(null)
    return true
  }

  useEffect(() => {
    if (canAnnotateRichMarkdown) {
      return
    }
    // Why: the popover and target are hidden by the render-time capability
    // derivation; only the editor-owned highlight needs imperative cleanup.
    clearAllAnnotationHighlights()
  }, [canAnnotateRichMarkdown, clearAllAnnotationHighlights])

  return {
    ...copyFeedback,
    ...rail,
    annotationPopover,
    annotationTarget,
    canAnnotateRichMarkdown,
    clearAnnotationHighlight,
    clearAnnotationTarget,
    clearAllAnnotationHighlights,
    clearTransientReviewState,
    markdownComments,
    markdownCommentsRef,
    markdownSourceLineOffsetRef,
    openAnnotationPopover,
    reviewRailExpanded,
    setAnnotationPopover,
    submitAnnotation,
    syncAnnotationTarget,
    unsentMarkdownReviewScope
  }
}

function cancelFrame(ref: MutableRefObject<number | null>): void {
  if (ref.current !== null) {
    window.cancelAnimationFrame(ref.current)
    ref.current = null
  }
}

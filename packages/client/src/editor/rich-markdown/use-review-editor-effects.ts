import type { DiffComment } from '@agentstart/protocol/git/diff-review'
import type { Editor } from '@tiptap/react'
import { useEffect, type RefObject } from 'react'

import { richMarkdownAnnotationHighlightPluginKey } from './annotation-highlight'
import { getRichMarkdownAnnotationHighlightRanges } from './review-annotations'

type UseRichMarkdownReviewEditorEffectsOptions = {
  canAnnotateRichMarkdown: boolean
  content: string
  editor: Editor | null
  markdownComments: DiffComment[]
  markdownSourceLineOffset: number
  scrollContainerRef: RefObject<HTMLDivElement | null>
  syncAnnotationTarget: (editor: Editor) => void
}

export function useRichMarkdownReviewEditorEffects({
  canAnnotateRichMarkdown,
  content,
  editor,
  markdownComments,
  markdownSourceLineOffset,
  scrollContainerRef,
  syncAnnotationTarget
}: UseRichMarkdownReviewEditorEffectsOptions): void {
  useEffect(() => {
    if (!editor || !canAnnotateRichMarkdown) {
      return
    }
    const noteRanges = getRichMarkdownAnnotationHighlightRanges(
      editor,
      markdownComments,
      markdownSourceLineOffset
    )
    editor.view.dispatch(
      editor.state.tr.setMeta(richMarkdownAnnotationHighlightPluginKey, { noteRanges })
    )
  }, [canAnnotateRichMarkdown, content, editor, markdownComments, markdownSourceLineOffset])

  useEffect(() => {
    if (!editor) {
      return
    }
    const container = scrollContainerRef.current
    if (!container) {
      return
    }
    const update = (): void => syncAnnotationTarget(editor)
    container.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      container.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [editor, scrollContainerRef, syncAnnotationTarget])
}

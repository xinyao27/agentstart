import type { DiffComment } from '@yiru/protocol/git/diff-review'
import { translate } from '~renderer/i18n/i18n'
import { getRelativePathInsideRoot, normalizeRelativePath } from '~renderer/path'

import { isMarkdownComment } from '../diff-comment-compat'
import {
  formatMarkdownReviewNotes,
  sortMarkdownReviewNotes,
  type MarkdownReviewNote
} from '../markdown-review-notes'
import type { NotesSendMenuScope } from '../notes-send-menu'

type UseRichMarkdownReviewDataOptions = {
  allDiffComments: DiffComment[] | undefined
  filePath: string
  markdownAnnotationFilePath?: string
  markdownAnnotationsEnabled: boolean
  markdownReviewContent: string
  worktreeRoot: string | null
}

export function useRichMarkdownReviewData({
  allDiffComments,
  filePath,
  markdownAnnotationFilePath,
  markdownAnnotationsEnabled,
  markdownReviewContent,
  worktreeRoot
}: UseRichMarkdownReviewDataOptions): {
  canAnnotateRichMarkdown: boolean
  markdownComments: DiffComment[]
  markdownReviewNotes: MarkdownReviewNote[]
  sourceRelativePath: string | null
  unsentMarkdownReviewScope: NotesSendMenuScope<MarkdownReviewNote>[]
} {
  const sourceRelativePath = (() =>
    markdownAnnotationFilePath
      ? normalizeRelativePath(markdownAnnotationFilePath)
      : getRelativePathInsideRoot(filePath, worktreeRoot))()
  const canAnnotateRichMarkdown = Boolean(markdownAnnotationsEnabled && sourceRelativePath !== null)
  const markdownComments = (() =>
    (allDiffComments ?? []).filter(
      (comment) => comment.filePath === sourceRelativePath && isMarkdownComment(comment)
    ))()
  const markdownReviewNotes = (() =>
    sortMarkdownReviewNotes(markdownComments as MarkdownReviewNote[]))()
  const unsentMarkdownReviewScope = (() => {
    const unsentNotes = markdownReviewNotes.filter((note) => !note.sentAt)
    return [
      {
        id: 'all',
        label: translate(
          'auto.components.editor.useRichMarkdownReviewData.f9d2acd6b0',
          'All unsent notes'
        ),
        notes: unsentNotes,
        prompt: formatMarkdownReviewNotes(unsentNotes, markdownReviewContent)
      }
    ]
  })()

  return {
    canAnnotateRichMarkdown,
    markdownComments,
    markdownReviewNotes,
    sourceRelativePath,
    unsentMarkdownReviewScope
  }
}

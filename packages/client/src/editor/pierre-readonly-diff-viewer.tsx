import type { DiffComment } from '@agentstart/protocol/git/diff-review'
import { getLargeDiffRenderLimit } from '@agentstart/protocol/git/render-limit'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { selectWorktreeDiffComments } from '~renderer/diff-comments/worktree-selector'
import { isDiffComment } from '~renderer/editor/diff-comment-compat'
import { resolveDocumentTheme } from '~renderer/editor/document-theme'
import { resolveEditorFontFamily } from '~renderer/editor/font-family'
import { computeDiffEditorFontSize } from '~renderer/editor/font-zoom'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import { DiffCodeView } from './diff-code-view/view'
import { getDiffViewerLargeDiffSaveAction } from './diff-viewer-large-diff-save-action'
import type { DiffViewerProps } from './diff-viewer-props'
import { LargeDiffFallback } from './large-diff-fallback'
import { registerPendingEditorFlush } from './pending-flush'

export function PierreReadonlyDiffViewer(props: DiffViewerProps): React.JSX.Element {
  const { onAddLineComment, relativePath, worktreeId } = props
  const settings = useAppStore((state) => state.settings)
  const editorFontZoomLevel = useAppStore((state) => state.editorFontZoomLevel)
  const addDiffComment = useAppStore((state) => state.addDiffComment)
  const deleteDiffComment = useAppStore((state) => state.deleteDiffComment)
  const updateDiffComment = useAppStore((state) => state.updateDiffComment)
  const scrollToDiffCommentId = useAppStore((state) => state.scrollToDiffCommentId)
  const setScrollToDiffCommentId = useAppStore((state) => state.setScrollToDiffCommentId)
  const allDiffComments = useAppStore((state): DiffComment[] | undefined =>
    selectWorktreeDiffComments(state, worktreeId)
  )
  const comments = (() =>
    (allDiffComments ?? []).filter(
      (comment) => comment.filePath === relativePath && isDiffComment(comment)
    ))()
  const renderLimit = (() =>
    props.largeDiffRenderLimit ??
    getLargeDiffRenderLimit({
      originalContent: props.originalContent,
      modifiedContent: props.modifiedContent
    }))()
  const isDark = resolveDocumentTheme(settings?.theme ?? 'system')
  const fontSize = computeDiffEditorFontSize(settings?.terminalFontSize ?? 13, editorFontZoomLevel)

  const handleAddLineComment = async (args: {
    lineNumber: number
    startLine?: number
    body: string
  }) => {
    if (onAddLineComment) {
      return onAddLineComment(args)
    }
    if (!worktreeId) {
      return false
    }
    const result = await addDiffComment({
      worktreeId,
      filePath: relativePath,
      source: 'diff',
      startLine: args.startLine,
      lineNumber: args.lineNumber,
      body: args.body,
      side: 'modified'
    })
    return Boolean(result)
  }

  const latestEditedContentRef = useRef(props.modifiedContent)
  useLayoutEffect(() => {
    latestEditedContentRef.current = props.modifiedContent
  }, [props.modifiedContent])
  const onContentChange = props.onContentChange
  const onSave = props.onSave
  const handleFileEditChange = (_fileKey: string, contents: string) => {
    latestEditedContentRef.current = contents
  }
  const handleFileEditComplete = (_fileKey: string, contents: string) => {
    latestEditedContentRef.current = contents
    onContentChange?.(contents)
    onSave?.(contents)
  }
  const flushPendingEdit = useEventCallback((): void => {
    const contents = latestEditedContentRef.current
    if (contents !== props.modifiedContent) {
      onContentChange?.(contents)
    }
  })
  useEffect(() => {
    if (!props.editable || !props.fileId) {
      return
    }
    return registerPendingEditorFlush(props.fileId, flushPendingEdit)
  }, [flushPendingEdit, props.editable, props.fileId])
  // Why: DiffCodeView folds these into the options object CodeView diffs each
  // render, so a fresh arrow here force-renders every mounted row.
  const handleAddLineCommentForPath = (
    _path: string,
    args: { lineNumber: number; startLine?: number; body: string }
  ) => handleAddLineComment(args)
  const handleDeleteComment = (commentId: string) => {
    if (worktreeId) {
      void deleteDiffComment(worktreeId, commentId)
    }
  }
  const handleUpdateComment = (commentId: string, body: string) =>
    worktreeId ? updateDiffComment(worktreeId, commentId, body) : Promise.resolve(false)
  const handlePendingScrollConsumed = () => setScrollToDiffCommentId(null)
  const files = (() => [
    {
      source: {
        key: props.modelKey,
        path: relativePath,
        // Why: the standalone viewer always renders a two-sided diff of one
        // file, so the change type is a plain modification.
        status: 'modified',
        originalContent: props.originalContent,
        modifiedContent: props.modifiedContent,
        language: props.language
      },
      comments,
      commentableLineNumbers: props.commentableLineNumbers,
      editable: props.editable === true
    }
  ])()
  const render = (() => ({
    isDark,
    sideBySide: props.sideBySide,
    wordWrap: settings?.diffWordWrap === true,
    disableFileHeader: true
  }))()
  const font = (() => ({ fontSize, fontFamily: resolveEditorFontFamily(settings) }))()

  if (renderLimit.limited) {
    return (
      <LargeDiffFallback
        filePath={relativePath}
        renderLimit={renderLimit}
        action={getDiffViewerLargeDiffSaveAction({
          editable: false,
          modifiedContent: props.modifiedContent,
          onSave: props.onSave,
          saveContentAvailable: props.largeDiffSaveContentAvailable
        })}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DiffCodeView
        files={files}
        render={render}
        font={font}
        scrollCacheKey={props.modelKey}
        className="scrollbar-editor bg-background h-full min-h-0 overflow-x-hidden overflow-y-auto"
        worktreeId={worktreeId}
        addLineCommentLabel={props.addLineCommentLabel}
        addLineCommentPlaceholder={props.addLineCommentPlaceholder}
        onAddLineComment={worktreeId || onAddLineComment ? handleAddLineCommentForPath : undefined}
        onDeleteComment={worktreeId ? handleDeleteComment : undefined}
        onUpdateComment={worktreeId ? handleUpdateComment : undefined}
        onFileEditChange={handleFileEditChange}
        pendingScrollCommentId={
          comments.some((comment) => comment.id === scrollToDiffCommentId)
            ? scrollToDiffCommentId
            : null
        }
        onFileEditComplete={handleFileEditComplete}
        onPendingScrollConsumed={handlePendingScrollConsumed}
      />
    </div>
  )
}

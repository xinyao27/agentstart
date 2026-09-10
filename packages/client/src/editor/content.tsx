import React from 'react'
import { useAppStore } from '~renderer/store/state'

import { getNextConflictNavigationIndex } from './conflict-components'
import { renderEditorDiffMode } from './content-diff-mode'
import { renderEditorEditMode } from './content-edit-mode'
import { noopCloseMarkdownTableOfContents } from './content-foundation'
import { renderEditorSpecialMode } from './content-special-modes'
import type { ConflictNavigation, EditorContentProps, EditorRenderContext } from './content-types'
import { findGitConflictBlocks, getGitConflictMarkerLineLength } from './git-conflict-blocks'
import type { OpenFile } from './state'
import { useMarkdownDocuments } from './use-markdown-documents'

export function EditorContent(props: EditorContentProps): React.JSX.Element {
  const {
    activeFile,
    handleSave,
    isMarkdown,
    mdViewMode,
    openFiles,
    resolvedLanguage,
    viewStateScopeId,
    worktreeEntries
  } = props
  const openConflictReviewFile = useAppStore((state) => state.openConflictReviewFile)
  const openConflictReview = useAppStore((state) => state.openConflictReview)
  const closeFile = useAppStore((state) => state.closeFile)
  const setPendingEditorReveal = useAppStore((state) => state.setPendingEditorReveal)
  const reloadOpenCheckRunDetailsTab = useAppStore((state) => state.reloadOpenCheckRunDetailsTab)
  const [conflictNavigationIndexByFile, setConflictNavigationIndexByFile] = React.useState<
    Record<string, number>
  >({})
  const markdown = useMarkdownDocuments(activeFile, isMarkdown, mdViewMode, handleSave)

  const getConflictNavigation = (
    file: OpenFile,
    content: string
  ): ConflictNavigation | undefined => {
    const blocks = findGitConflictBlocks(content)
    if (blocks.length === 0) {
      return undefined
    }

    const currentIndex = conflictNavigationIndexByFile[file.id] ?? null
    return {
      currentIndex,
      total: blocks.length,
      onJump: (direction) => {
        const nextIndex = getNextConflictNavigationIndex({
          currentIndex,
          direction,
          total: blocks.length
        })
        if (nextIndex === null) {
          return
        }
        const line = blocks[nextIndex].startLine
        const markerLineLength = getGitConflictMarkerLineLength(content, line)
        setConflictNavigationIndexByFile((previous) => ({
          ...previous,
          [file.id]: nextIndex
        }))
        // Why: two same-location requests can arrive before Monaco consumes
        // the first. Clearing makes the next reveal an observable state change.
        setPendingEditorReveal(null)
        queueMicrotask(() => {
          setPendingEditorReveal({
            filePath: file.filePath,
            line,
            column: 1,
            matchLength: markerLineLength
          })
        })
      }
    }
  }

  const editorViewStateKey =
    viewStateScopeId === activeFile.id
      ? activeFile.filePath
      : `${activeFile.filePath}::${viewStateScopeId}`
  const diffViewStateKey =
    viewStateScopeId === activeFile.id ? activeFile.id : `${activeFile.id}::${viewStateScopeId}`
  const isCombinedDiff =
    activeFile.mode === 'diff' &&
    (activeFile.diffSource === 'combined-all' ||
      activeFile.diffSource === 'combined-uncommitted' ||
      activeFile.diffSource === 'combined-branch' ||
      activeFile.diffSource === 'combined-commit')
  const context: EditorRenderContext = {
    ...props,
    showMarkdownTableOfContents: props.showMarkdownTableOfContents ?? false,
    showMarkdownFrontmatter: props.showMarkdownFrontmatter ?? false,
    onCloseMarkdownTableOfContents:
      props.onCloseMarkdownTableOfContents ?? noopCloseMarkdownTableOfContents,
    markdownAnnotationsEnabled: props.markdownAnnotationsEnabled ?? true,
    editorViewStateKey,
    diffViewStateKey,
    markdownPreviewViewStateKey:
      viewStateScopeId === activeFile.id
        ? `${activeFile.id}:preview`
        : `${activeFile.id}::${viewStateScopeId}:preview`,
    codeLanguage: resolvedLanguage === 'notebook' ? 'json' : resolvedLanguage,
    isCombinedDiff,
    markdown,
    activeConflictEntry:
      worktreeEntries.find((entry) => entry.path === activeFile.relativePath) ?? null,
    selectedConflictReviewFile:
      activeFile.mode === 'conflict-review' && activeFile.conflictReview?.selectedFileId
        ? (openFiles.find((file) => file.id === activeFile.conflictReview?.selectedFileId) ?? null)
        : null,
    getConflictNavigation,
    openConflictReviewFile,
    openConflictReview,
    closeFile,
    reloadOpenCheckRunDetailsTab
  }

  if (
    activeFile.mode === 'check-details' ||
    activeFile.mode === 'conflict-review' ||
    activeFile.mode === 'markdown-preview' ||
    isCombinedDiff
  ) {
    return renderEditorSpecialMode(context)
  }
  if (activeFile.mode === 'edit') {
    return renderEditorEditMode(context)
  }
  return renderEditorDiffMode(context)
}

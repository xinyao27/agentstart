import type { GitStatusEntry } from '@agentstart/protocol/git/status-types'
import React from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { translate } from '~renderer/i18n/i18n'
import { joinPath } from '~renderer/path'
import { showWorkspaceSidebar } from '~renderer/workspace-panel/show-sidebar'

import { ConflictBanner, ConflictPlaceholderView, ConflictReviewPanel } from './conflict-components'
import {
  FileLoadErrorView,
  matchesPendingEditorReveal,
  noopEditorContentChange,
  noopEditorSave
} from './content-foundation'
import type { EditorRenderContext } from './content-types'
import type { OpenFile } from './state'

const FileCodeView = lazy(() => import('./file-code-view'))
const FilePreviewViewer = lazy(() => import('./file-preview-viewer'))
const ImageViewer = lazy(() => import('./image-viewer'))

function createConflictReviewContentFile(
  context: EditorRenderContext,
  entry: GitStatusEntry
): OpenFile {
  const { activeFile } = context
  const absolutePath = joinPath(activeFile.filePath, entry.path)
  const conflict =
    entry.conflictKind && entry.conflictStatus && entry.conflictStatusSource
      ? entry.status === 'deleted'
        ? {
            kind: 'conflict-placeholder' as const,
            conflictKind: entry.conflictKind,
            conflictStatus: entry.conflictStatus,
            conflictStatusSource: entry.conflictStatusSource,
            message: translate(
              'auto.components.editor.EditorContent.8b1a605bae',
              'This file is in a conflict state, but no working-tree file is available to edit.'
            ),
            guidance: 'Resolve the conflict in Git or restore one side before reopening it.'
          }
        : {
            kind: 'conflict-editable' as const,
            conflictKind: entry.conflictKind,
            conflictStatus: entry.conflictStatus,
            conflictStatusSource: entry.conflictStatusSource
          }
      : undefined

  return {
    id: absolutePath,
    filePath: absolutePath,
    relativePath: entry.path,
    worktreeId: activeFile.worktreeId,
    language: detectLanguage(entry.path),
    isDirty: false,
    mode: 'edit',
    conflict
  }
}

function renderConflictReviewEditorContent(
  context: EditorRenderContext,
  options: {
    contentFile: OpenFile
    entry: GitStatusEntry | null
    className: string
    viewStateKeySuffix: string
    readOnly?: boolean
    autoHeight?: boolean
  }
): React.JSX.Element {
  const {
    editBuffers,
    fileContents,
    getConflictNavigation,
    handleContentChangeForFile,
    handleSaveForFile,
    pendingEditorReveal,
    reloadContent,
    viewStateScopeId
  } = context
  const {
    contentFile,
    entry,
    className,
    viewStateKeySuffix,
    readOnly = false,
    autoHeight = false
  } = options

  if (contentFile.conflict?.kind === 'conflict-placeholder') {
    return (
      <div className={className}>
        <ConflictPlaceholderView file={contentFile} />
      </div>
    )
  }
  const fileContent = fileContents[contentFile.id]
  if (!fileContent) {
    return (
      <div className={className}>
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          {translate('auto.components.editor.EditorContent.b2735221f5', 'Loading...')}
        </div>
      </div>
    )
  }
  if (fileContent.loadError) {
    return (
      <div className={className}>
        <FileLoadErrorView
          message={fileContent.loadError}
          onRetry={() => reloadContent(contentFile)}
        />
      </div>
    )
  }
  if (fileContent.preview) {
    return (
      <div className={className}>
        <FilePreviewViewer file={contentFile} preview={fileContent.preview} />
      </div>
    )
  }
  if (fileContent.isBinary) {
    return (
      <div className={className}>
        {fileContent.isImage ? (
          <ImageViewer
            content={fileContent.content}
            filePath={contentFile.filePath}
            mimeType={fileContent.mimeType}
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {translate(
              'auto.components.editor.EditorContent.b9de81ba52',
              'Binary file — cannot display'
            )}
          </div>
        )}
      </div>
    )
  }

  const language = detectLanguage(contentFile.relativePath)
  const viewStateKey = `${contentFile.filePath}::${viewStateScopeId}:${viewStateKeySuffix}`
  const content = editBuffers[contentFile.id] ?? fileContent.content
  return (
    <div className={className}>
      {contentFile.conflict && (
        <ConflictBanner
          file={contentFile}
          entry={entry}
          conflictNavigation={getConflictNavigation(contentFile, content)}
        />
      )}
      <div className={autoHeight ? 'shrink-0' : 'min-h-0 flex-1'}>
        <FileCodeView
          key={`${viewStateScopeId}:${contentFile.id}:${viewStateKeySuffix}`}
          fileId={contentFile.id}
          filePath={contentFile.filePath}
          viewStateKey={viewStateKey}
          relativePath={contentFile.relativePath}
          content={content}
          language={language === 'notebook' ? 'json' : language}
          onContentChange={
            readOnly
              ? noopEditorContentChange
              : (next) => handleContentChangeForFile(contentFile, next)
          }
          onSave={readOnly ? noopEditorSave : (next) => handleSaveForFile(contentFile, next)}
          worktreeId={contentFile.worktreeId}
          readOnly={readOnly}
          revealLine={
            matchesPendingEditorReveal(pendingEditorReveal, contentFile)
              ? pendingEditorReveal.line
              : undefined
          }
        />
      </div>
    </div>
  )
}

function renderConflictReviewAllContent(context: EditorRenderContext): React.JSX.Element {
  const snapshotEntries = context.activeFile.conflictReview?.entries ?? []
  const liveEntriesByPath = new Map(context.worktreeEntries.map((entry) => [entry.path, entry]))
  const unresolvedEntries = snapshotEntries.flatMap((entry) => {
    const liveEntry = liveEntriesByPath.get(entry.path)
    return liveEntry?.conflictStatus === 'unresolved' && liveEntry.conflictKind ? [liveEntry] : []
  })

  return (
    <div className="scrollbar-sleek bg-background min-h-0 flex-1 overflow-y-auto">
      {unresolvedEntries.map((entry) =>
        renderConflictReviewEditorContent(context, {
          contentFile: createConflictReviewContentFile(context, entry),
          entry,
          className: 'flex min-h-[120px] flex-col border-b border-border last:border-b-0',
          viewStateKeySuffix: `overview:${entry.path}`,
          readOnly: true,
          autoHeight: true
        })
      )}
    </div>
  )
}

export function renderConflictReview(context: EditorRenderContext): React.JSX.Element {
  const {
    activeFile,
    closeFile,
    openConflictReview,
    openConflictReviewFile,
    selectedConflictReviewFile,
    worktreeEntries
  } = context
  const selectedContent = selectedConflictReviewFile
    ? renderConflictReviewEditorContent(context, {
        contentFile: selectedConflictReviewFile,
        entry:
          worktreeEntries.find((entry) => entry.path === selectedConflictReviewFile.relativePath) ??
          null,
        className: 'flex min-h-0 flex-1 flex-col',
        viewStateKeySuffix: 'selected'
      })
    : renderConflictReviewAllContent(context)

  return (
    <ConflictReviewPanel
      file={activeFile}
      liveEntries={worktreeEntries}
      onOpenEntry={(entry) => {
        openConflictReviewFile(
          activeFile.id,
          activeFile.worktreeId,
          activeFile.filePath,
          entry,
          detectLanguage(entry.path)
        )
      }}
      selectedFile={selectedConflictReviewFile}
      selectedContent={selectedContent}
      onDismiss={() => closeFile(activeFile.id)}
      onRefreshSnapshot={() =>
        openConflictReview(
          activeFile.worktreeId,
          activeFile.filePath,
          worktreeEntries.flatMap((entry) =>
            entry.conflictStatus === 'unresolved' && entry.conflictKind
              ? [{ path: entry.path, conflictKind: entry.conflictKind }]
              : []
          ),
          'live-summary'
        )
      }
      onReturnToSourceControl={() =>
        showWorkspaceSidebar({ view: 'source-control', worktreeId: activeFile.worktreeId })
      }
    />
  )
}

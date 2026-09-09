import type { GitDiffResult } from '@yiru/protocol/git/diff-values'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import React from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import type { OpenFile } from '~renderer/editor/state'
import { translate } from '~renderer/i18n/i18n'

import { ConflictBanner } from './conflict-components'
import { getDiffContentSignature } from './diff-content-signature'

const DiffViewer = lazy(() => import('./diff-viewer'))

// Why: Changes view mode renders an edit-mode tab as a HEAD-vs-working-tree
// diff without creating a separate diff-tab object. The draft is the live
// source on the modified side; onContentChange is the same callback as normal
// edit mode so dirty tracking, autosave, and close-prompt plumbing all continue
// to work unchanged. See reviews/changes-view-mode-plan.md.
export function ChangesModeView({
  activeFile,
  dc,
  modifiedContent,
  activeConflictEntry,
  resolvedLanguage,
  sideBySide,
  viewStateScopeId,
  diffViewStateKey,
  onContentChange,
  onSave
}: {
  activeFile: OpenFile
  dc: GitDiffResult | undefined
  modifiedContent: string
  activeConflictEntry: GitStatusEntry | null
  resolvedLanguage: string
  sideBySide: boolean
  viewStateScopeId: string
  diffViewStateKey: string
  onContentChange: (content: string) => void
  onSave: (content: string) => Promise<void>
}): React.JSX.Element {
  if (!dc) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {translate('auto.components.editor.ChangesModeView.54e0035b15', 'Loading diff...')}
      </div>
    )
  }
  if (dc.kind === 'binary') {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="space-y-2">
          <div className="text-foreground text-sm font-medium">
            {translate('auto.components.editor.ChangesModeView.7dffb0f563', 'Binary file')}
          </div>
          <div className="text-muted-foreground text-xs">
            {translate(
              'auto.components.editor.ChangesModeView.052c184f24',
              'Text diff is unavailable for this file.'
            )}
          </div>
        </div>
      </div>
    )
  }
  // Why: Monaco renders an empty diff when the two sides match, which reads as
  // a broken view. Surface an inline banner so the user knows Changes mode is
  // active but there is simply nothing to diff right now.
  const isDiffBodyPruned = dc.largeDiffRenderLimit?.limited === true
  const isIdentical = !isDiffBodyPruned && dc.originalContent === modifiedContent
  // Why: after a terminal commit/pull/rebase, Changes mode refreshes the
  // HEAD-side blob in React state, but Monaco can keep painting the previous
  // diff if we reuse the same kept model identities. Rotate only the
  // original-side model identity so Monaco rebuilds the stale HEAD snapshot
  // without throwing away the modified-side undo history.
  const headContentSignature = getDiffContentSignature(dc.originalContent)
  const originalModelKey = `${diffViewStateKey}:original:${headContentSignature}`
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {activeFile.conflict && <ConflictBanner file={activeFile} entry={activeConflictEntry} />}
      {isIdentical && (
        <div className="border-border/60 bg-muted/40 text-muted-foreground border-b px-3 py-2 text-xs">
          {translate(
            'auto.components.editor.ChangesModeView.ef25ae2d09',
            'No uncommitted changes.'
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <DiffViewer
          key={viewStateScopeId}
          fileId={activeFile.id}
          modelKey={diffViewStateKey}
          originalModelKey={originalModelKey}
          originalContent={dc.originalContent}
          modifiedContent={modifiedContent}
          largeDiffRenderLimit={dc.largeDiffRenderLimit}
          language={resolvedLanguage}
          filePath={activeFile.filePath}
          relativePath={activeFile.relativePath}
          sideBySide={sideBySide}
          editable={true}
          worktreeId={activeFile.worktreeId}
          onContentChange={onContentChange}
          onSave={onSave}
        />
      </div>
    </div>
  )
}

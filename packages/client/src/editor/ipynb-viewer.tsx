import { DIFFS_TAG_NAME } from '@pierre/diffs'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { resolveEditorFontFamilyOrInherit } from '~renderer/editor/font-family'
import { computeEditorFontSize } from '~renderer/editor/font-zoom'
import { scrollTopCache, setWithLRU } from '~renderer/editor/scroll-cache'
import { translate } from '~renderer/i18n/i18n'
import { WarningCircle as AlertCircle } from '~renderer/icons/hugeicons'
import { useShortcutKeyDetails } from '~renderer/keyboard-input/use-shortcut-label'
import { useProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { runNotebookPythonCell } from '~renderer/runtime/notebook-target'
import { useAppStore } from '~renderer/store/state'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { getCellKey, hasOwnDraft } from './ipynb-cell-editor'
import { IpynbLayout } from './ipynb-layout'
import { parseIpynb } from './ipynb-parse'
import {
  cancelIpynbStructuralContentFrames,
  createNotebookExecutionTrustState,
  NOTEBOOK_SOURCE_COMMIT_DELAY_MS,
  requestIpynbStructuralContentFrame
} from './ipynb-state'
import type { IpynbCellKind } from './ipynb-types'
import {
  deleteIpynbCell,
  insertIpynbCell,
  moveIpynbCell,
  updateIpynbCellKind,
  updateIpynbCellOutputs,
  updateIpynbCellSources
} from './ipynb-update'
import { registerPendingEditorFlush } from './pending-flush'
import { editorShortcutMatches } from './shortcuts'

type IpynbViewerProps = {
  content: string
  fileId: string
  filePath: string
  worktreeId: string
  scrollCacheKey: string
  onContentChange: (content: string) => void
  onDirtyStateHint: (dirty: boolean) => void
  onSave: (content: string) => Promise<void>
}

export default function IpynbViewer({
  content,
  fileId,
  filePath,
  worktreeId,
  scrollCacheKey,
  onContentChange,
  onDirtyStateHint,
  onSave
}: IpynbViewerProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const projectRuntimeState = useProjectCatalogRuntimeState()
  const [runningCellIndex, setRunningCellIndex] = useState<number | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null)
  const [executionTrustState, setExecutionTrustState] = useState(() =>
    createNotebookExecutionTrustState(filePath)
  )
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, string>>({})
  const sourceDraftsRef = useRef(sourceDrafts)
  const contentRef = useRef(content)
  const notebookRef = useRef<ReturnType<typeof parseIpynb> | null>(null)
  const onContentChangeRef = useRef(onContentChange)
  const onDirtyStateHintRef = useRef(onDirtyStateHint)
  const sourceCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const structuralContentFrameIdsRef = useRef<number[]>([])
  const fontSize = computeEditorFontSize(13, editorFontZoomLevel)
  const parsed = (() => {
    try {
      return { notebook: parseIpynb(content), error: null as string | null }
    } catch (error) {
      return {
        notebook: null,
        error: error instanceof Error ? error.message : 'Invalid notebook'
      }
    }
  })()
  useLayoutEffect(() => {
    contentRef.current = content
    notebookRef.current = parsed.notebook
    onContentChangeRef.current = onContentChange
    onDirtyStateHintRef.current = onDirtyStateHint
  }, [content, onContentChange, onDirtyStateHint, parsed.notebook])

  // Why: execution trust belongs to the currently rendered file; resetting
  // during render avoids a paint with the previous file's trust prompt state.
  if (executionTrustState.filePath !== filePath) {
    setExecutionTrustState(createNotebookExecutionTrustState(filePath))
  }
  const executionTrustedForFile =
    executionTrustState.filePath === filePath ? executionTrustState.trustedForFile : false
  const pendingRunCellIndex =
    executionTrustState.filePath === filePath ? executionTrustState.pendingRunCellIndex : null

  const setPendingRunCellIndexForFile = (nextPendingRunCellIndex: number | null): void => {
    setExecutionTrustState((current) => ({
      filePath,
      trustedForFile: current.filePath === filePath ? current.trustedForFile : false,
      pendingRunCellIndex: nextPendingRunCellIndex
    }))
  }
  const trustFileForExecution = (): void => {
    setExecutionTrustState({
      filePath,
      trustedForFile: true,
      pendingRunCellIndex: null
    })
  }

  const materializeSourceDrafts = (): string => {
    const notebook = notebookRef.current
    const drafts = sourceDraftsRef.current
    if (!notebook || Object.keys(drafts).length === 0) {
      return contentRef.current
    }
    const updates = notebook.cells
      .map((cell, index) => {
        const key = getCellKey(cell, index)
        return hasOwnDraft(drafts, key) ? { index, source: drafts[key] ?? '' } : null
      })
      .filter((update): update is { index: number; source: string } => update !== null)
    return updateIpynbCellSources(contentRef.current, updates)
  }

  const flushSourceDrafts = useEventCallback((): string => {
    if (sourceCommitTimerRef.current !== null) {
      clearTimeout(sourceCommitTimerRef.current)
      sourceCommitTimerRef.current = null
    }
    const nextContent = materializeSourceDrafts()
    if (nextContent !== contentRef.current) {
      contentRef.current = nextContent
      onContentChangeRef.current(nextContent)
    }
    return nextContent
  })

  const queueSourceDraftCommit = (): void => {
    if (sourceCommitTimerRef.current !== null) {
      clearTimeout(sourceCommitTimerRef.current)
    }
    sourceCommitTimerRef.current = setTimeout(() => {
      void flushSourceDrafts()
    }, NOTEBOOK_SOURCE_COMMIT_DELAY_MS)
  }

  useEffect(() => {
    return registerPendingEditorFlush(fileId, flushSourceDrafts)
  }, [fileId, flushSourceDrafts])

  const setRootRef = (node: HTMLDivElement | null): void => {
    rootRef.current = node
    if (node !== null) {
      return
    }
    // Why: pending source edits and structural mutation frames belong to the
    // notebook scroll root; clear them when that DOM owner detaches.
    void flushSourceDrafts()
    cancelIpynbStructuralContentFrames(structuralContentFrameIdsRef)
  }

  useEffect(() => {
    if (!parsed.notebook || Object.keys(sourceDraftsRef.current).length === 0) {
      return
    }
    const nextDrafts = { ...sourceDraftsRef.current }
    let changed = false
    parsed.notebook.cells.forEach((cell, index) => {
      const key = getCellKey(cell, index)
      if (hasOwnDraft(nextDrafts, key) && nextDrafts[key] === cell.source) {
        delete nextDrafts[key]
        changed = true
      }
    })
    if (changed) {
      sourceDraftsRef.current = nextDrafts
      setSourceDrafts(nextDrafts)
    }
  }, [parsed.notebook])

  useLayoutEffect(() => {
    const container = rootRef.current
    if (!container) {
      return
    }
    let throttleTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = (): void => {
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer)
      }
      throttleTimer = setTimeout(() => {
        setWithLRU(scrollTopCache, scrollCacheKey, container.scrollTop)
        throttleTimer = null
      }, 150)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (container.scrollHeight > container.clientHeight || container.scrollTop > 0) {
        setWithLRU(scrollTopCache, scrollCacheKey, container.scrollTop)
      }
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer)
      }
      container.removeEventListener('scroll', onScroll)
    }
  }, [scrollCacheKey])

  useLayoutEffect(() => {
    const container = rootRef.current
    const targetScrollTop = scrollTopCache.get(scrollCacheKey)
    if (!container || targetScrollTop === undefined) {
      return
    }
    container.scrollTop = targetScrollTop
  }, [scrollCacheKey, content])

  const saveNotebook = async (): Promise<void> => {
    const latestContent = flushSourceDrafts()
    await onSave(latestContent)
  }
  const saveShortcut = useShortcutKeyDetails('editor.save')

  const handleNotebookKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.repeat || !editorShortcutMatches('editor.save', event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    void saveNotebook()
  }

  const handleNotebookPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (editingCellKey === null) {
      return
    }
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest(DIFFS_TAG_NAME)) {
      return
    }
    setEditingCellKey(null)
  }

  if (parsed.error || !parsed.notebook) {
    return (
      <div className="bg-background text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        <div className="border-border bg-background flex max-w-md items-start gap-3 rounded-md border p-4">
          <AlertCircle className="text-destructive mt-0.5 size-4" />
          <div>
            <div className="text-foreground font-medium">
              {translate(
                'auto.components.editor.IpynbViewer.c1601b23b2',
                'Unable to render notebook'
              )}
            </div>
            <div className="mt-1">{parsed.error}</div>
          </div>
        </div>
      </div>
    )
  }

  const { notebook } = parsed
  const applyContent = (nextContent: string): void => {
    contentRef.current = nextContent
    onContentChange(nextContent)
  }
  const updateCellSource = (index: number, source: string): void => {
    const cell = notebook.cells[index]
    if (!cell) {
      return
    }
    const key = getCellKey(cell, index)
    const nextDrafts = { ...sourceDraftsRef.current, [key]: source }
    sourceDraftsRef.current = nextDrafts
    setSourceDrafts(nextDrafts)
    onDirtyStateHintRef.current(true)
    queueSourceDraftCommit()
  }
  const applyStructuralContentChange = (
    getNextContent: (latestContent: string) => string
  ): void => {
    const latestContent = flushSourceDrafts()
    // Why: Monaco can still have a render frame queued for the active cell.
    // Exit edit mode first, then reorder/replace cells on the next frame so
    // structural notebook actions do not dispose an editor mid-render.
    setEditingCellKey(null)
    requestIpynbStructuralContentFrame(structuralContentFrameIdsRef, () => {
      applyContent(getNextContent(latestContent))
    })
  }
  const updateCellKind = (index: number, kind: IpynbCellKind): void => {
    applyStructuralContentChange((latestContent) =>
      updateIpynbCellKind(latestContent, index, kind, notebook.language)
    )
  }
  const insertCell = (index: number, kind: IpynbCellKind): void => {
    applyStructuralContentChange((latestContent) =>
      insertIpynbCell(latestContent, index, kind, notebook.language)
    )
  }
  const moveCell = (index: number, direction: -1 | 1): void => {
    applyStructuralContentChange((latestContent) => moveIpynbCell(latestContent, index, direction))
  }
  const deleteCell = (index: number): void => {
    applyStructuralContentChange((latestContent) => deleteIpynbCell(latestContent, index))
  }
  const runCell = async (
    index: number,
    options: { skipTrustPrompt?: boolean } = {}
  ): Promise<void> => {
    const latestContent = flushSourceDrafts()
    const latestNotebook = parseIpynb(latestContent)
    const cell = latestNotebook.cells[index]
    if (!cell || cell.kind !== 'code' || runningCellIndex !== null) {
      return
    }
    if (!executionTrustedForFile && !options.skipTrustPrompt) {
      setPendingRunCellIndexForFile(index)
      return
    }
    setRunError(null)
    setRunningCellIndex(index)
    try {
      await onSave(latestContent)
      const preamble = latestNotebook.cells
        .slice(0, index)
        .filter((previousCell) => previousCell.kind === 'code')
        .map((previousCell) => previousCell.source)
        .join('\n\n')
      // Why: a worktree owned by a paired runtime environment has no Python
      // interpreter reachable from this browser process — run the cell where
      // the notebook file actually lives instead of defaulting to local. The
      // dropped `connectionId` (formerly sent only on the local branch) only
      // ever fails the call closed with "local files only" — Repo.connectionId
      // is dead since remote hosts were removed (#63); resolveAuthorizedPath's
      // own host-path check now does the equivalent rejection.
      const environmentId = getRuntimeEnvironmentIdForWorktree(projectRuntimeState, worktreeId)
      const target = environmentId
        ? ({ kind: 'environment', environmentId } as const)
        : ({ kind: 'local' } as const)
      const result = await runNotebookPythonCell(target, {
        filePath,
        code: cell.source,
        preamble
      })
      applyContent(updateIpynbCellOutputs(latestContent, index, result))
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error))
    } finally {
      setRunningCellIndex(null)
    }
  }
  const cancelPendingRun = (): void => setPendingRunCellIndexForFile(null)
  const confirmPendingRun = (): void => {
    const index = pendingRunCellIndex
    trustFileForExecution()
    if (index !== null) {
      void runCell(index, { skipTrustPrompt: true })
    }
  }

  return (
    <div
      ref={setRootRef}
      className="scrollbar-editor bg-background h-full min-h-0 overflow-auto"
      style={{ fontSize, fontFamily: resolveEditorFontFamilyOrInherit(settings) }}
      onKeyDownCapture={handleNotebookKeyDownCapture}
      onPointerDownCapture={handleNotebookPointerDownCapture}
    >
      <IpynbLayout
        filePath={filePath}
        notebook={notebook}
        runError={runError}
        saveShortcut={saveShortcut}
        sourceDrafts={sourceDrafts}
        runningCellIndex={runningCellIndex}
        editingCellKey={editingCellKey}
        setEditingCellKey={setEditingCellKey}
        pendingRunCellIndex={pendingRunCellIndex}
        onSave={saveNotebook}
        onRunCell={(index) => void runCell(index)}
        onUpdateCellKind={updateCellKind}
        onInsertCell={insertCell}
        onMoveCell={moveCell}
        onDeleteCell={deleteCell}
        onUpdateCellSource={updateCellSource}
        onCancelPendingRun={cancelPendingRun}
        onConfirmPendingRun={confirmPendingRun}
      />
    </div>
  )
}

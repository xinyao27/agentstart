import type { StateCreator } from 'zustand'
import { notifyHostOfMirroredEditorClose } from '~renderer/runtime/close-mirrored-editor-tab'
import type { AppState } from '~renderer/store/types'
import { pushRecentlyClosedTabKind } from '~renderer/tab-bar/state/recently-closed'

import { MAX_RECENT_CLOSED_EDITOR_TABS, type ClosedEditorTabSnapshot } from './file-model'
import type { EditorFileSlice } from './file-store'
import { removeMarkdownVisibilityKeys } from './preview-replacement'
import type { EditorSlice } from './store-contract'
import { deleteUntouchedUntitledFile, shouldDeleteUntouchedUntitledFile } from './untitled-cleanup'

type EditorFileCloseActions = Pick<EditorFileSlice, 'closeFile'>

export function createEditorFileCloseActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorFileCloseActions {
  return {
    closeFile: (fileId) => {
      // Why: capture untitled + dirty state before the set() call mutates the
      // store, so we can decide after the tab is removed whether the on-disk
      // file should be cleaned up (untitled files closed without edits are
      // throwaway and should not litter the worktree).
      const preClose = get().openFiles.find((f) => f.id === fileId)
      // Why: also check editorDrafts as a safety net — isDirty is set via a
      // debounced callback from the editor, so there's a narrow window where
      // content exists but isDirty hasn't flushed yet. A draft means the user
      // typed something, so the file should be kept.
      const hasDraft = !!get().editorDrafts[fileId]
      const shouldDeleteFromDisk = shouldDeleteUntouchedUntitledFile(preClose, hasDraft)

      // Why: closeFile is the single chokepoint every editor close funnels through
      // (tab strips, bulk close, save/discard, floating panel). Mirrored tabs are
      // host-owned, so the host must close its copy too or its next snapshot
      // re-mirrors the file and the tab reopens. No-op for the host's own files.
      notifyHostOfMirroredEditorClose(get(), preClose?.worktreeId, fileId)

      set((s) => {
        const closedFile = s.openFiles.find((f) => f.id === fileId)
        const idx = s.openFiles.findIndex((f) => f.id === fileId)
        const newFiles = s.openFiles.filter((f) => f.id !== fileId)
        const newEditorDrafts = { ...s.editorDrafts }
        delete newEditorDrafts[fileId]
        const newMarkdownViewMode = { ...s.markdownViewMode }
        delete newMarkdownViewMode[fileId]
        const newEditorViewMode = { ...s.editorViewMode }
        delete newEditorViewMode[fileId]
        const markdownVisibilityKeys = new Set([fileId])
        if (closedFile?.markdownPreviewSourceFileId) {
          markdownVisibilityKeys.add(closedFile.markdownPreviewSourceFileId)
        }
        const visibilityKeysToRemove = [...markdownVisibilityKeys].filter(
          (key) =>
            !newFiles.some((file) => file.id === key || file.markdownPreviewSourceFileId === key)
        )
        const newMarkdownFrontmatterVisible =
          visibilityKeysToRemove.length > 0
            ? removeMarkdownVisibilityKeys(s.markdownFrontmatterVisible, visibilityKeysToRemove)
            : s.markdownFrontmatterVisible
        const newMarkdownTableOfContentsVisible =
          visibilityKeysToRemove.length > 0
            ? removeMarkdownVisibilityKeys(s.markdownTableOfContentsVisible, visibilityKeysToRemove)
            : s.markdownTableOfContentsVisible
        // Why: editorCursorLine entries are keyed by fileId and accumulate on
        // every cursor move. Without cleanup they grow without bound across a
        // long session as files are opened and closed.
        const newEditorCursorLine = { ...s.editorCursorLine }
        delete newEditorCursorLine[fileId]
        let newActiveId = s.activeFileId
        const newActiveFileIdByWorktree = { ...s.activeFileIdByWorktree }

        if (s.activeFileId === fileId) {
          // Find next file within the same worktree
          const worktreeId = closedFile?.worktreeId
          const worktreeFiles = worktreeId
            ? newFiles.filter((f) => f.worktreeId === worktreeId)
            : newFiles
          if (worktreeFiles.length === 0) {
            newActiveId = null
          } else {
            // Pick adjacent file from same worktree
            const closedWorktreeIdx = worktreeId
              ? s.openFiles
                  .filter((f) => f.worktreeId === worktreeId)
                  .findIndex((f) => f.id === fileId)
              : idx
            newActiveId =
              closedWorktreeIdx >= worktreeFiles.length
                ? worktreeFiles.at(-1)!.id
                : worktreeFiles[closedWorktreeIdx].id
          }
          if (worktreeId) {
            newActiveFileIdByWorktree[worktreeId] = newActiveId
          }
        }

        // Why: editor tabs share a mixed tab strip with browser tabs. Closing the
        // last editor in a worktree should reveal an available browser tab before
        // falling all the way back to a terminal surface.
        const activeWorktreeId = s.activeWorktreeId
        const remainingForWorktree = activeWorktreeId
          ? newFiles.filter((f) => f.worktreeId === activeWorktreeId)
          : newFiles
        const browserTabsForWorktree = activeWorktreeId
          ? (s.browserTabsByWorktree[activeWorktreeId] ?? [])
          : []
        const terminalTabsForWorktree = activeWorktreeId
          ? (s.tabsByWorktree[activeWorktreeId] ?? [])
          : []
        const fallbackBrowserTabId =
          activeWorktreeId && browserTabsForWorktree.length > 0
            ? (s.activeBrowserTabIdByWorktree[activeWorktreeId] ??
              browserTabsForWorktree[0]?.id ??
              null)
            : s.activeBrowserTabId
        const newActiveTabType =
          remainingForWorktree.length > 0
            ? s.activeTabType
            : browserTabsForWorktree.length > 0
              ? 'browser'
              : 'terminal'
        const newActiveTabTypeByWorktree = { ...s.activeTabTypeByWorktree }
        if (activeWorktreeId && remainingForWorktree.length === 0) {
          newActiveTabTypeByWorktree[activeWorktreeId] =
            browserTabsForWorktree.length > 0 ? 'browser' : 'terminal'
        }
        const shouldDeactivateWorktree =
          activeWorktreeId !== null &&
          remainingForWorktree.length === 0 &&
          browserTabsForWorktree.length === 0 &&
          terminalTabsForWorktree.length === 0

        // Why: keep tabBarOrderByWorktree in sync so stale editor IDs don't
        // linger and cause position shifts the next time the order is reconciled.
        const worktreeId = closedFile?.worktreeId ?? activeWorktreeId
        const nextTabBarOrderByWorktree =
          worktreeId && s.tabBarOrderByWorktree
            ? {
                ...s.tabBarOrderByWorktree,
                [worktreeId]: (s.tabBarOrderByWorktree[worktreeId] ?? []).filter(
                  (entryId) => entryId !== fileId
                )
              }
            : s.tabBarOrderByWorktree

        let nextRecentlyClosed = s.recentlyClosedEditorTabsByWorktree
        let nextRecentlyClosedKinds = s.recentlyClosedTabKindsByWorktree
        const wtRecent = closedFile?.worktreeId
        // Why: untitled files that were never edited will be deleted from disk
        // after close. Adding them to the reopen stack would let Cmd+Shift+T
        // try to reopen a path that no longer exists. Preview tabs are also
        // excluded — they are ephemeral views, not user-opened files.
        if (
          closedFile &&
          wtRecent &&
          !shouldDeleteFromDisk &&
          closedFile.mode !== 'markdown-preview'
        ) {
          const {
            id: _id,
            isDirty: _dirty,
            mirroredFromRuntimeSession: _mirrored,
            ...snap
          } = closedFile
          const stack = s.recentlyClosedEditorTabsByWorktree[wtRecent] ?? []
          nextRecentlyClosed = {
            ...s.recentlyClosedEditorTabsByWorktree,
            [wtRecent]: [snap as ClosedEditorTabSnapshot, ...stack].slice(
              0,
              MAX_RECENT_CLOSED_EDITOR_TABS
            )
          }
          nextRecentlyClosedKinds = pushRecentlyClosedTabKind(
            s.recentlyClosedTabKindsByWorktree,
            wtRecent,
            'editor'
          )
        }

        return {
          openFiles: newFiles,
          editorDrafts: newEditorDrafts,
          editorCursorLine: newEditorCursorLine,
          activeFileId: newActiveId,
          // Why: if closing the last editor also leaves the worktree without any
          // browser or terminal surface, keep parity with the terminal/browser
          // close handlers and return to the AgentStart landing state instead of
          // leaving an active worktree selected with nothing renderable.
          activeWorktreeId: shouldDeactivateWorktree ? null : s.activeWorktreeId,
          activeBrowserTabId: shouldDeactivateWorktree
            ? null
            : activeWorktreeId && remainingForWorktree.length === 0
              ? fallbackBrowserTabId
              : s.activeBrowserTabId,
          activeTabType: newActiveTabType,
          activeFileIdByWorktree: newActiveFileIdByWorktree,
          activeTabTypeByWorktree: newActiveTabTypeByWorktree,
          markdownViewMode: newMarkdownViewMode,
          editorViewMode: newEditorViewMode,
          markdownFrontmatterVisible: newMarkdownFrontmatterVisible,
          markdownTableOfContentsVisible: newMarkdownTableOfContentsVisible,
          tabBarOrderByWorktree: nextTabBarOrderByWorktree,
          pendingEditorReveal: null,
          recentlyClosedEditorTabsByWorktree: nextRecentlyClosed,
          recentlyClosedTabKindsByWorktree: nextRecentlyClosedKinds
        }
      })

      // Why: untitled files that were never edited are empty placeholders — they
      // exist on disk only because createUntitledMarkdownFile() eagerly writes
      // them so the editor has a real path to bind to. If the user closes the
      // tab without typing anything, the file is just clutter. Fire-and-forget
      // delete; failure (e.g. already removed externally) is harmless.
      if (shouldDeleteFromDisk && preClose && typeof window !== 'undefined') {
        deleteUntouchedUntitledFile(get(), preClose)
      }

      // Why: the unified tab model drives visual tab-bar order and next-active
      // selection (MRU-based, falling back to the visual neighbor). Without
      // this, closing an editor/diff tab picks the next active file from the
      // openFiles array instead of running the unified close path, producing
      // inconsistent behavior vs terminal/browser tab closes which already go
      // through closeUnifiedTab.
      for (const tabs of Object.values(get().unifiedTabsByWorktree ?? {})) {
        const unifiedTab = tabs.find(
          (entry) =>
            entry.entityId === fileId &&
            (entry.contentType === 'editor' ||
              entry.contentType === 'diff' ||
              entry.contentType === 'conflict-review' ||
              entry.contentType === 'check-details')
        )
        if (unifiedTab) {
          get().closeUnifiedTab(unifiedTab.id)
          break
        }
      }
    }
  }
}

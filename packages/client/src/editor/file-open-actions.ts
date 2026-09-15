import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'
import { pushRecentlyClosedTabKind } from '~renderer/tab-bar/state/recently-closed'

import {
  getReusableOpenFileModes,
  isSameEditorOwner,
  matchesEditorMode,
  resolveEditorFileIdForOwner,
  shouldRequestExistingFileContentReload
} from './file-identity'
import { MAX_RECENT_CLOSED_EDITOR_TABS, type ClosedEditorTabSnapshot } from './file-model'
import type { EditorFileSlice } from './file-store'
import {
  getReplaceablePreviewFileId,
  removeEditorStateForReplacedPreview
} from './preview-replacement'
import type { EditorSlice } from './store-contract'
import {
  buildEditorActiveResult,
  openWorkspaceEditorItem,
  resolveEditorOpenTargetGroupId
} from './workspace-editor-target'

type EditorFileOpenActions = Pick<
  EditorFileSlice,
  | 'openFiles'
  | 'activeFileId'
  | 'activeFileIdByWorktree'
  | 'activeTabTypeByWorktree'
  | 'activeTabType'
  | 'recentlyClosedEditorTabsByWorktree'
  | 'setActiveTabType'
  | 'openFile'
>

export function createEditorFileOpenActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorFileOpenActions {
  return {
    // Open files
    openFiles: [],
    activeFileId: null,
    activeFileIdByWorktree: {},
    activeTabTypeByWorktree: {},
    activeTabType: 'terminal',
    recentlyClosedEditorTabsByWorktree: {},
    setActiveTabType: (type) =>
      set((s) => {
        const worktreeId = s.activeWorktreeId
        return {
          activeTabType: type,
          activeTabTypeByWorktree: worktreeId
            ? { ...s.activeTabTypeByWorktree, [worktreeId]: type }
            : s.activeTabTypeByWorktree
        }
      }),

    openFile: (file, options) => {
      let editorItemWorktreeId = file.worktreeId
      let editorItemFileId = file.filePath
      let editorItemLabel = file.relativePath
      let editorItemContentType: 'editor' | 'diff' | 'conflict-review' | 'check-details' =
        file.mode === 'conflict-review'
          ? 'conflict-review'
          : file.mode === 'check-details'
            ? 'check-details'
            : file.mode === 'diff'
              ? 'diff'
              : 'editor'
      let editorItemTargetGroupId = options?.targetGroupId
      set((s) => {
        const worktreeId = file.worktreeId
        const runtimeEnvironmentId =
          file.runtimeEnvironmentId === null
            ? null
            : (file.runtimeEnvironmentId ??
              (options?.suppressActiveRuntimeFallback
                ? null
                : (s.settings?.activeRuntimeEnvironmentId?.trim() ?? undefined)))
        const reusableOpenFileModes = getReusableOpenFileModes(file.mode)
        const existing = s.openFiles.find(
          (f) =>
            f.filePath === file.filePath &&
            matchesEditorMode(f, reusableOpenFileModes) &&
            isSameEditorOwner(f, worktreeId, runtimeEnvironmentId)
        )
        const id = resolveEditorFileIdForOwner(
          s,
          file.filePath,
          worktreeId,
          runtimeEnvironmentId,
          reusableOpenFileModes
        )
        editorItemFileId = id
        const isPreview = options?.preview ?? false
        const recordReplacedPreview = options?.recordReplacedPreview ?? false
        // Why: resolve the target group up-front so preview replacement can be
        // scoped to that group. Opening as preview in group B must not evict a
        // preview tab belonging to group A (split tab groups).
        const targetGroupId =
          resolveEditorOpenTargetGroupId(s, worktreeId, options?.targetGroupId) ?? undefined
        editorItemTargetGroupId = targetGroupId
        const activeResult = buildEditorActiveResult(s, worktreeId, id)

        if (existing) {
          // If opening as non-preview, also pin the existing tab
          const updatedPreview = isPreview ? existing.isPreview : false
          const fileContentReloadNonce = shouldRequestExistingFileContentReload(
            existing,
            file.mode,
            options
          )
            ? (existing.fileContentReloadNonce ?? 0) + 1
            : existing.fileContentReloadNonce
          const needsExistingUpdate =
            existing.mode !== file.mode ||
            existing.diffSource !== file.diffSource ||
            existing.branchCompare?.compareVersion !== file.branchCompare?.compareVersion ||
            existing.commitCompare?.compareVersion !== file.commitCompare?.compareVersion ||
            existing.conflict?.kind !== file.conflict?.kind ||
            existing.conflict?.conflictKind !== file.conflict?.conflictKind ||
            existing.conflict?.conflictStatus !== file.conflict?.conflictStatus ||
            existing.conflictReview?.snapshotTimestamp !== file.conflictReview?.snapshotTimestamp ||
            existing.isPreview !== updatedPreview ||
            existing.language !== file.language ||
            existing.relativePath !== file.relativePath ||
            existing.worktreeId !== file.worktreeId ||
            existing.runtimeEnvironmentId !== runtimeEnvironmentId ||
            existing.fileContentReloadNonce !== fileContentReloadNonce
          if (!needsExistingUpdate) {
            return activeResult
          }
          // Why: `readOnly` is intentionally NOT in this override map. It is
          // sticky: an existing tab keeps its own authority (`...f`). View Log
          // never flips a writable tab to read-only, and an ordinary open never
          // silently upgrades a read-only View Log tab to writable.
          return {
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? {
                    ...f,
                    relativePath: file.relativePath,
                    worktreeId: file.worktreeId,
                    language: file.language,
                    runtimeEnvironmentId,
                    mode: file.mode,
                    diffSource: file.diffSource,
                    branchCompare: file.branchCompare,
                    commitCompare: file.commitCompare,
                    branchOldPath: file.branchOldPath,
                    combinedAlternate: file.combinedAlternate,
                    combinedAreaFilter: file.combinedAreaFilter,
                    commitEntriesSnapshot: file.commitEntriesSnapshot,
                    conflict: file.conflict,
                    skippedConflicts: file.skippedConflicts,
                    conflictReview: file.conflictReview,
                    isPreview: updatedPreview,
                    fileContentReloadNonce
                  }
                : f
            ),
            ...activeResult
          }
        }

        // If opening as preview, replace the existing preview tab.
        // Why: preview replacement is scoped to `worktreeId + targetGroupId` so
        // link clicks in group B do not silently evict previews from group A.
        // Falls back to worktree-wide when group plumbing is unavailable,
        // matching the prior behavior.
        let newFiles = s.openFiles
        if (isPreview) {
          const replaceablePreviewId = getReplaceablePreviewFileId(s, worktreeId, targetGroupId)
          const existingPreviewIdx = s.openFiles.findIndex((f) => f.id === replaceablePreviewId)
          if (existingPreviewIdx !== -1) {
            const replacedPreview = s.openFiles[existingPreviewIdx]
            // Why: reuse the shared eviction helper (as the four other preview-
            // replacement paths do) so per-file cursor/draft/visibility cleanup stays
            // defined in one place instead of a hand-rolled copy that drifts.
            const {
              editorDrafts: nextEditorDrafts,
              editorCursorLine: nextEditorCursorLine,
              markdownViewMode: nextMarkdownViewMode,
              editorViewMode: nextEditorViewMode,
              markdownFrontmatterVisible: nextMarkdownFrontmatterVisible,
              markdownTableOfContentsVisible: nextMarkdownTableOfContentsVisible
            } = removeEditorStateForReplacedPreview(s, replacedPreview, id)
            // Replace in-place to preserve tab position
            newFiles = s.openFiles.map((f, i) =>
              i === existingPreviewIdx
                ? { ...file, id, isDirty: false, isPreview: true, runtimeEnvironmentId }
                : f
            )
            // Swap the old preview ID for the new one in the stored tab bar order
            const prevOrder = s.tabBarOrderByWorktree?.[worktreeId]
            const previewTabBarUpdate = prevOrder
              ? {
                  tabBarOrderByWorktree: {
                    ...s.tabBarOrderByWorktree,
                    [worktreeId]: prevOrder.map((eid) => (eid === replacedPreview.id ? id : eid))
                  }
                }
              : {}
            // Why: link-activation replaces previews by default, so users walking
            // A → B → C can't reach A via Cmd/Ctrl+Shift+T unless we push the
            // evicted preview onto the recently-closed stack. Gated with
            // recordReplacedPreview so file-explorer single-click (which
            // semantically *wants* silent eviction) is unaffected.
            let nextRecentlyClosed = s.recentlyClosedEditorTabsByWorktree
            let nextRecentlyClosedKinds = s.recentlyClosedTabKindsByWorktree
            if (recordReplacedPreview && replacedPreview.id !== id) {
              const {
                id: _rid,
                isDirty: _rdirty,
                mirroredFromRuntimeSession: _rmirrored,
                ...snap
              } = replacedPreview
              const stack = s.recentlyClosedEditorTabsByWorktree[worktreeId] ?? []
              nextRecentlyClosed = {
                ...s.recentlyClosedEditorTabsByWorktree,
                [worktreeId]: [snap as ClosedEditorTabSnapshot, ...stack].slice(
                  0,
                  MAX_RECENT_CLOSED_EDITOR_TABS
                )
              }
              nextRecentlyClosedKinds = pushRecentlyClosedTabKind(
                s.recentlyClosedTabKindsByWorktree,
                worktreeId,
                'editor'
              )
            }
            return {
              openFiles: newFiles,
              editorDrafts: nextEditorDrafts,
              editorCursorLine: nextEditorCursorLine,
              markdownViewMode: nextMarkdownViewMode,
              editorViewMode: nextEditorViewMode,
              markdownFrontmatterVisible: nextMarkdownFrontmatterVisible,
              markdownTableOfContentsVisible: nextMarkdownTableOfContentsVisible,
              recentlyClosedEditorTabsByWorktree: nextRecentlyClosed,
              recentlyClosedTabKindsByWorktree: nextRecentlyClosedKinds,
              ...previewTabBarUpdate,
              ...activeResult
            }
          }
        }

        // Why: append the new file to the persisted tab bar order so it appears
        // at the end of the tab bar. Without this, reconcileOrder in TabBar
        // falls back to type-grouped ordering (terminals first) when the stored
        // order doesn't contain the new file.
        const tabBarUpdate: Record<string, unknown> = {}
        if (s.tabBarOrderByWorktree) {
          const currentOrder = s.tabBarOrderByWorktree[worktreeId] ?? []
          const terminalIds = (s.tabsByWorktree?.[worktreeId] ?? []).map((t) => t.id)
          const editorFileIds = s.openFiles
            .filter((f) => f.worktreeId === worktreeId)
            .map((f) => f.id)
          const browserIds = (s.browserTabsByWorktree?.[worktreeId] ?? []).map((t) => t.id)
          const allExisting = new Set([...terminalIds, ...editorFileIds, ...browserIds])
          const base = currentOrder.filter((eid) => allExisting.has(eid))
          const inBase = new Set(base)
          for (const eid of [...terminalIds, ...editorFileIds, ...browserIds]) {
            if (!inBase.has(eid)) {
              base.push(eid)
              inBase.add(eid)
            }
          }
          base.push(id)
          tabBarUpdate.tabBarOrderByWorktree = { ...s.tabBarOrderByWorktree, [worktreeId]: base }
        }

        return {
          openFiles: [
            ...newFiles,
            {
              ...file,
              id,
              isDirty: false,
              isPreview: isPreview || undefined,
              runtimeEnvironmentId
            }
          ],
          ...tabBarUpdate,
          ...activeResult
        }
      })
      void openWorkspaceEditorItem(
        get(),
        editorItemFileId,
        editorItemWorktreeId,
        editorItemLabel,
        editorItemContentType,
        options?.preview ?? false,
        editorItemTargetGroupId
      )
    }
  }
}

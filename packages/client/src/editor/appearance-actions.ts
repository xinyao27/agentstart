import { isPathInsideOrEqual } from '@agentstart/protocol/host/path'
import { clampMarkdownTocPanelWidth } from '@agentstart/protocol/settings/markdown-toc'
import {
  WORKSPACE_PANEL_DEFAULT_WIDTH,
  clampWorkspacePanelWidth
} from '@agentstart/protocol/settings/workspace-panel'
import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import type { EditorAppearanceSlice } from './appearance-store'
import { createDefaultFileSearchState } from './search-defaults'
import type { EditorSlice } from './store-contract'

export function createEditorAppearanceActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorAppearanceSlice {
  return {
    editorDrafts: {},
    setEditorDraft: (fileId, content) =>
      set((s) => {
        // Why: read-only tabs (e.g. AI Vault View Log) must never accumulate an
        // editor draft — a draft is the seed of dirty state, autosave, and a
        // hot-exit restore that could write over an agent-owned transcript.
        const file = s.openFiles.find((f) => f.id === fileId)
        if (file?.readOnly === true) {
          return s
        }
        return { editorDrafts: { ...s.editorDrafts, [fileId]: content } }
      }),
    clearEditorDraft: (fileId) =>
      set((s) => {
        if (!(fileId in s.editorDrafts)) {
          return s
        }
        const next = { ...s.editorDrafts }
        delete next[fileId]
        return { editorDrafts: next }
      }),
    clearEditorDrafts: (fileIds) =>
      set((s) => {
        if (fileIds.length === 0) {
          return s
        }
        const next = { ...s.editorDrafts }
        let changed = false
        for (const fileId of fileIds) {
          if (fileId in next) {
            delete next[fileId]
            changed = true
          }
        }
        return changed ? { editorDrafts: next } : s
      }),

    // Markdown view mode
    markdownViewMode: {},
    setMarkdownViewMode: (fileId, mode) =>
      set((s) => ({
        markdownViewMode: { ...s.markdownViewMode, [fileId]: mode }
      })),

    // Editor view mode (edit vs changes-diff). See EditorViewMode.
    editorViewMode: {},
    setEditorViewMode: (fileId, mode) =>
      set((s) => {
        // Why: default is 'edit'. Writing 'edit' explicitly when no entry exists
        // would grow the record unnecessarily; delete instead so the shape stays
        // minimal and hydration round-trips cleanly.
        if (mode === 'edit') {
          if (!(fileId in s.editorViewMode)) {
            return s
          }
          const next = { ...s.editorViewMode }
          delete next[fileId]
          return { editorViewMode: next }
        }
        return { editorViewMode: { ...s.editorViewMode, [fileId]: mode } }
      }),

    // Markdown preview front-matter visibility (#4468). Default is hidden; the
    // preview only renders the front-matter card when the user opts in per file.
    markdownFrontmatterVisible: {},
    setMarkdownFrontmatterVisible: (fileId, visible) =>
      set((s) => {
        // Why: default is visible. Writing `true` explicitly when no entry exists
        // would grow the record unnecessarily; delete instead so the map only
        // carries hide overrides and hydration round-trips cleanly — same
        // trade-off as setEditorViewMode above.
        if (visible) {
          if (!(fileId in s.markdownFrontmatterVisible)) {
            return s
          }
          const next = { ...s.markdownFrontmatterVisible }
          delete next[fileId]
          return { markdownFrontmatterVisible: next }
        }
        return { markdownFrontmatterVisible: { ...s.markdownFrontmatterVisible, [fileId]: false } }
      }),

    // Markdown table of contents visibility
    markdownTableOfContentsVisible: {},
    setMarkdownTableOfContentsVisible: (fileId, visible) =>
      set((s) => {
        if (!visible) {
          if (!(fileId in s.markdownTableOfContentsVisible)) {
            return s
          }
          const next = { ...s.markdownTableOfContentsVisible }
          delete next[fileId]
          return { markdownTableOfContentsVisible: next }
        }
        return {
          markdownTableOfContentsVisible: {
            ...s.markdownTableOfContentsVisible,
            [fileId]: true
          }
        }
      }),

    // Markdown table of contents panel sizing
    markdownTocPanelWidth: 240,
    setMarkdownTocPanelWidth: (width) =>
      set((s) => ({
        markdownTocPanelWidth: clampMarkdownTocPanelWidth(width, undefined, s.markdownTocPanelWidth)
      })),

    // Workspace tool panel
    workspacePanelOpen: false,
    workspacePanelTab: 'explorer',
    workspacePanelExplorerView: 'files',
    workspacePanelWidth: WORKSPACE_PANEL_DEFAULT_WIDTH,
    setWorkspacePanelWidth: (width) =>
      set((s) => ({
        workspacePanelWidth: clampWorkspacePanelWidth(width, undefined, s.workspacePanelWidth)
      })),
    workspacePanelRouteRequestId: 0,
    workspacePanelTabByWorktree: {},
    workspacePanelExplorerViewByWorktree: {},
    toggleWorkspacePanel: () => set((s) => ({ workspacePanelOpen: !s.workspacePanelOpen })),
    setWorkspacePanelOpen: (open) => set({ workspacePanelOpen: open }),
    setWorkspacePanelTab: (tab) =>
      set((s) => ({
        workspacePanelTab: tab,
        workspacePanelRouteRequestId: s.workspacePanelRouteRequestId + 1,
        ...(s.activeWorktreeId
          ? {
              workspacePanelTabByWorktree: {
                ...s.workspacePanelTabByWorktree,
                [s.activeWorktreeId]: tab
              }
            }
          : {}),
        ...(tab === 'explorer' ? { workspacePanelExplorerView: 'files' as const } : {})
      })),
    setWorkspacePanelExplorerView: (view) =>
      set((s) => ({
        workspacePanelExplorerView: view,
        workspacePanelRouteRequestId: s.workspacePanelRouteRequestId + 1,
        ...(s.activeWorktreeId
          ? {
              workspacePanelExplorerViewByWorktree: {
                ...s.workspacePanelExplorerViewByWorktree,
                [s.activeWorktreeId]: view
              }
            }
          : {})
      })),
    showWorkspacePanelFiles: () =>
      set((s) => ({
        workspacePanelOpen: true,
        workspacePanelTab: 'explorer',
        workspacePanelExplorerView: 'files',
        workspacePanelRouteRequestId: s.workspacePanelRouteRequestId + 1,
        ...(s.activeWorktreeId
          ? {
              workspacePanelTabByWorktree: {
                ...s.workspacePanelTabByWorktree,
                [s.activeWorktreeId]: 'explorer'
              },
              workspacePanelExplorerViewByWorktree: {
                ...s.workspacePanelExplorerViewByWorktree,
                [s.activeWorktreeId]: 'files'
              }
            }
          : {})
      })),
    showWorkspacePanelSearch: (payload) =>
      set((s) => {
        const next = {
          workspacePanelOpen: true,
          workspacePanelTab: 'explorer' as const,
          workspacePanelExplorerView: 'search' as const,
          workspacePanelRouteRequestId: s.workspacePanelRouteRequestId + 1,
          ...(s.activeWorktreeId
            ? {
                workspacePanelTabByWorktree: {
                  ...s.workspacePanelTabByWorktree,
                  [s.activeWorktreeId]: 'explorer' as const
                },
                workspacePanelExplorerViewByWorktree: {
                  ...s.workspacePanelExplorerViewByWorktree,
                  [s.activeWorktreeId]: 'search' as const
                }
              }
            : {})
        }
        if (!s.activeWorktreeId) {
          return next
        }

        const query = payload?.query?.trim() ? payload.query : null
        const includePattern = payload?.includePattern?.trim() ? payload.includePattern : null
        const current =
          s.fileSearchStateByWorktree[s.activeWorktreeId] || createDefaultFileSearchState()
        const shouldSeed = Boolean(query || (includePattern && current.query.trim()))
        const shouldFocus = !shouldSeed
        const nextSearchState = {
          ...current,
          ...(query ? { query } : {}),
          ...(includePattern ? { includePattern } : {}),
          ...(shouldSeed
            ? {
                results: null,
                loading: false,
                collapsedFiles: new Set<string>(),
                seedRequestId: (current.seedRequestId ?? 0) + 1
              }
            : {}),
          ...(shouldFocus ? { focusRequestId: (current.focusRequestId ?? 0) + 1 } : {})
        }

        return {
          ...next,
          fileSearchStateByWorktree: {
            ...s.fileSearchStateByWorktree,
            [s.activeWorktreeId]: nextSearchState
          }
        }
      }),

    // File explorer
    expandedDirs: {},
    collapseAllDirs: (worktreeId) =>
      set((s) => {
        const current = s.expandedDirs[worktreeId]
        if (!current?.size) {
          return s
        }
        return {
          expandedDirs: {
            ...s.expandedDirs,
            [worktreeId]: new Set<string>()
          }
        }
      }),
    collapseDirSubtree: (worktreeId, dirPath) =>
      set((s) => {
        const current = s.expandedDirs[worktreeId]
        if (!current?.size) {
          return s
        }
        const next = new Set(
          Array.from(current).filter((expandedDir) => !isPathInsideOrEqual(dirPath, expandedDir))
        )
        if (next.size === current.size) {
          return s
        }
        return { expandedDirs: { ...s.expandedDirs, [worktreeId]: next } }
      }),
    toggleDir: (worktreeId, dirPath) =>
      set((s) => {
        const current = s.expandedDirs[worktreeId] ?? new Set<string>()
        const next = new Set(current)
        if (next.has(dirPath)) {
          next.delete(dirPath)
        } else {
          next.add(dirPath)
        }
        return { expandedDirs: { ...s.expandedDirs, [worktreeId]: next } }
      }),
    pendingExplorerReveal: null,
    revealInExplorer: (worktreeId, filePath) =>
      set((s) => ({
        workspacePanelOpen: true,
        workspacePanelTab: 'explorer',
        workspacePanelExplorerView: 'files',
        workspacePanelRouteRequestId: s.workspacePanelRouteRequestId + 1,
        workspacePanelTabByWorktree: {
          ...s.workspacePanelTabByWorktree,
          [worktreeId]: 'explorer'
        },
        workspacePanelExplorerViewByWorktree: {
          ...s.workspacePanelExplorerViewByWorktree,
          [worktreeId]: 'files'
        },
        pendingExplorerReveal: { worktreeId, filePath, requestId: Date.now() }
      })),
    clearPendingExplorerReveal: () => set({ pendingExplorerReveal: null })
  }
}

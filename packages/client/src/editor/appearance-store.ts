import type {
  ActiveWorkspacePanelTab,
  WorkspacePanelExplorerView
} from '@agentstart/protocol/settings/ui-state'

import type { EditorViewMode, MarkdownViewMode } from './file-model'

export type EditorAppearanceSlice = {
  // Why: #300 originally kept EditorPanel mounted while hidden so unsaved
  // drafts and autosave timers could survive tab switches. Drafts live in the
  // store instead so the visible editor UI can unmount without losing edits or
  // widening the app-shutdown surface.
  editorDrafts: Record<string, string>
  setEditorDraft: (fileId: string, content: string) => void
  clearEditorDraft: (fileId: string) => void
  clearEditorDrafts: (fileIds: string[]) => void

  // Markdown view mode per file (fileId -> mode)
  markdownViewMode: Record<string, MarkdownViewMode>
  setMarkdownViewMode: (fileId: string, mode: MarkdownViewMode) => void

  // Editor view mode per file (fileId -> mode). Orthogonal to markdownViewMode:
  // a markdown file can be in Raw+Changes, Rendered+Changes, etc. Absent entry
  // means 'edit'.
  editorViewMode: Record<string, EditorViewMode>
  setEditorViewMode: (fileId: string, mode: EditorViewMode) => void

  // Per-file opt-in to render front matter in the markdown preview (#4468).
  // Default is hidden; absent entry means hidden. Storing only the explicit
  // true values keeps the record minimal and the default implicit.
  markdownFrontmatterVisible: Record<string, boolean>
  setMarkdownFrontmatterVisible: (fileId: string, visible: boolean) => void

  // Per-file opt-in to keep the markdown table of contents open. Default is
  // hidden; absent entry means hidden.
  markdownTableOfContentsVisible: Record<string, boolean>
  setMarkdownTableOfContentsVisible: (fileId: string, visible: boolean) => void

  // Markdown table of contents panel sizing
  markdownTocPanelWidth: number
  setMarkdownTocPanelWidth: (width: number) => void

  // Workspace tool panel state
  workspacePanelOpen: boolean
  workspacePanelTab: ActiveWorkspacePanelTab
  workspacePanelExplorerView: WorkspacePanelExplorerView
  workspacePanelWidth: number
  setWorkspacePanelWidth: (width: number) => void
  workspacePanelRouteRequestId: number
  workspacePanelTabByWorktree: Record<string, ActiveWorkspacePanelTab>
  workspacePanelExplorerViewByWorktree: Record<string, WorkspacePanelExplorerView>
  toggleWorkspacePanel: () => void
  setWorkspacePanelOpen: (open: boolean) => void
  setWorkspacePanelTab: (tab: ActiveWorkspacePanelTab) => void
  setWorkspacePanelExplorerView: (view: WorkspacePanelExplorerView) => void
  showWorkspacePanelFiles: () => void
  showWorkspacePanelSearch: (payload?: {
    query?: string | null
    includePattern?: string | null
  }) => void

  // File explorer state
  expandedDirs: Record<string, Set<string>> // worktreeId -> set of expanded dir paths
  collapseAllDirs: (worktreeId: string) => void
  collapseDirSubtree: (worktreeId: string, dirPath: string) => void
  toggleDir: (worktreeId: string, dirPath: string) => void
  pendingExplorerReveal: {
    worktreeId: string
    filePath: string
    requestId: number
    flash?: boolean
  } | null
  revealInExplorer: (worktreeId: string, filePath: string) => void
  clearPendingExplorerReveal: () => void
}

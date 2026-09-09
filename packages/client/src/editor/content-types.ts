import type { GitDiffResult } from '@yiru/protocol/git/diff-values'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import type { AppState } from '~renderer/store/types'

import type { FilePreview } from './file-preview-kind'
import type { OpenFile, PendingEditorReveal } from './state'
import type { MarkdownViewMode } from './state'
import type { UseMarkdownDocumentsResult } from './use-markdown-documents'

export type FileContent = {
  content: string
  isBinary: boolean
  preview?: FilePreview
  isImage?: boolean
  mimeType?: string
  loadError?: string
}

export type EditorContentProps = {
  activeFile: OpenFile
  viewStateScopeId: string
  fileContents: Record<string, FileContent>
  diffContents: Record<string, GitDiffResult>
  editBuffers: Record<string, string>
  openFiles: OpenFile[]
  worktreeEntries: GitStatusEntry[]
  resolvedLanguage: string
  isMarkdown: boolean
  isMermaid: boolean
  isCsv: boolean
  isNotebook: boolean
  mdViewMode: MarkdownViewMode
  isChangesMode: boolean
  sideBySide: boolean
  showMarkdownTableOfContents?: boolean
  showMarkdownFrontmatter?: boolean
  onCloseMarkdownTableOfContents?: () => void
  markdownAnnotationsEnabled?: boolean
  pendingEditorReveal: PendingEditorReveal | null
  handleContentChange: (content: string) => void
  handleContentChangeForFile: (file: OpenFile, content: string) => void
  handleDirtyStateHint: (dirty: boolean) => void
  handleSave: (content: string) => Promise<void>
  handleSaveForFile: (file: OpenFile, content: string) => Promise<void>
  reloadContent: (file: OpenFile) => void
}

export type ConflictNavigation = {
  currentIndex: number | null
  total: number
  onJump: (direction: 'previous' | 'next') => void
}

export type EditorRenderContext = EditorContentProps & {
  showMarkdownTableOfContents: boolean
  showMarkdownFrontmatter: boolean
  onCloseMarkdownTableOfContents: () => void
  markdownAnnotationsEnabled: boolean
  editorViewStateKey: string
  diffViewStateKey: string
  markdownPreviewViewStateKey: string
  codeLanguage: string
  isCombinedDiff: boolean
  markdown: UseMarkdownDocumentsResult
  activeConflictEntry: GitStatusEntry | null
  selectedConflictReviewFile: OpenFile | null
  getConflictNavigation: (file: OpenFile, content: string) => ConflictNavigation | undefined
  openConflictReviewFile: AppState['openConflictReviewFile']
  openConflictReview: AppState['openConflictReview']
  closeFile: AppState['closeFile']
  reloadOpenCheckRunDetailsTab: AppState['reloadOpenCheckRunDetailsTab']
}

import type { FileSearchResult as SearchResult } from '@yiru/protocol/files/values'
import type { WorkspaceSessionState } from '@yiru/protocol/workspace/session'
import type { WorkspaceSessionHydrationOptions } from '~renderer/workspace/session-hydration-keys'

import type { PendingEditorReveal } from './file-model'

export type EditorSearchSlice = {
  // File search state
  fileSearchStateByWorktree: Record<
    string,
    {
      query: string
      caseSensitive: boolean
      wholeWord: boolean
      useRegex: boolean
      includePattern: string
      excludePattern: string
      results: SearchResult | null
      loading: boolean
      collapsedFiles: Set<string>
      seedRequestId?: number
      focusRequestId?: number
    }
  >
  updateFileSearchState: (
    worktreeId: string,
    updates: Partial<EditorSearchSlice['fileSearchStateByWorktree'][string]>
  ) => void
  seedFileSearchQuery: (worktreeId: string, query: string) => void
  seedFileSearchIncludePattern: (worktreeId: string, includePattern: string) => void
  consumeFileSearchSeedRequest: (worktreeId: string, seedRequestId: number) => void
  toggleFileSearchCollapsedFile: (worktreeId: string, filePath: string) => void
  clearFileSearch: (worktreeId: string) => void

  // Editor navigation (for search result → go-to-line)
  pendingEditorReveal: PendingEditorReveal | null
  setPendingEditorReveal: (reveal: PendingEditorReveal | null) => void

  // Session hydration — restore editor files from persisted workspace session
  hydrateEditorSession: (
    session: WorkspaceSessionState,
    options?: WorkspaceSessionHydrationOptions
  ) => void
}

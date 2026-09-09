import type { TuiAgent } from '../agent/types.js'

export type TabGroupSplitDirection = 'horizontal' | 'vertical'

export type TabGroupLayoutNode =
  | { type: 'leaf'; groupId: string }
  | {
      type: 'split'
      direction: TabGroupSplitDirection
      first: TabGroupLayoutNode
      second: TabGroupLayoutNode

      ratio?: number
    }
export type WorkspacePanelTabContentType =
  | 'explorer'
  | 'vault'
  | 'workspaces'
  | 'pr-checks'
  | 'source-control'
  | 'ports'

export type GitGraphTabContentType = 'git-graph'

export type TabContentType =
  | 'terminal'
  | 'editor'
  | 'diff'
  | 'conflict-review'
  | 'check-details'
  | 'browser'
  | 'simulator'
  | GitGraphTabContentType

export type WorkspaceVisibleTabType = 'terminal' | 'editor' | 'browser' | 'simulator'
export type CtrlTabOrderMode = 'mru' | 'sequential'

export type Tab = {
  id: string // UUID for terminals, filePath for editors (preserves current convention)
  entityId: string // ID of the backing content (terminal tab ID, file path, browser workspace ID)
  groupId: string
  worktreeId: string
  contentType: TabContentType
  label: string // display title (auto-derived from PTY or filename)
  generatedLabel?: string | null
  quickCommandLabel?: string | null
  customLabel: string | null
  color: string | null
  sortOrder: number
  createdAt: number
  isPreview?: boolean // preview tabs get replaced by next single-click open
  isPinned?: boolean // pinned tabs survive "close others"
}

export type TabGroup = {
  id: string
  worktreeId: string
  activeTabId: string | null
  tabOrder: string[] // canonical visual order of tab IDs

  recentTabIds?: string[]
}
export type TerminalTab = {
  id: string

  ptyId: string | null
  worktreeId: string

  worktreeInstanceId?: string
  title: string

  defaultTitle?: string

  generatedTitle?: string | null

  quickCommandLabel?: string | null
  customTitle: string | null
  color: string | null

  isPinned?: boolean
  sortOrder: number
  createdAt: number

  generation?: number

  shellOverride?: string

  startupCwd?: string

  launchAgent?: TuiAgent

  // Why: Bun restore can seed this transient activation handoff; writers omit it from persistence.
  pendingActivationSpawn?: boolean | number
}

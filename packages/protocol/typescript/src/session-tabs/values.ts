export const SESSION_TABS_PROTOCOL_CAPABILITY = 'session.tabs.protobuf.v1' as const

export type SessionTabsTabTypeValue = 'terminal' | 'markdown' | 'file' | 'browser'
export type SessionTabsAgentStateValue = 'working' | 'blocked' | 'waiting' | 'done'

// Why: The closed agent union keeps session snapshots compatible with agent launch validation.
export type SessionTabsLaunchAgentValue =
  | 'claude'
  | 'openclaude'
  | 'codex'
  | 'autohand'
  | 'opencode'
  | 'mimo-code'
  | 'pi'
  | 'omp'
  | 'gemini'
  | 'antigravity'
  | 'aider'
  | 'goose'
  | 'amp'
  | 'kilo'
  | 'kiro'
  | 'crush'
  | 'aug'
  | 'cline'
  | 'codebuff'
  | 'command-code'
  | 'continue'
  | 'cursor'
  | 'droid'
  | 'kimi'
  | 'mistral-vibe'
  | 'qwen-code'
  | 'rovo'
  | 'hermes'
  | 'openclaw'
  | 'copilot'
  | 'grok'
  | 'devin'
  | 'ante'
  | 'trae'

export type SessionTabsProviderSessionValue = {
  key: 'session_id' | 'conversation_id'
  id: string
  transcriptPath?: string
}

export type SessionTabsAgentStatusValue = {
  state: SessionTabsAgentStateValue
  prompt: string
  updatedAt: number
  stateStartedAt: number
  paneKey: string
  stateHistory: never[]
  agentType?: string
  model?: string
  tabId?: string
  worktreeId?: string
  connectionId?: string | null
  toolName?: string
  toolInput?: string
  interactivePrompt?: string
  lastAssistantMessage?: string
  interrupted?: boolean
  providerSession?: SessionTabsProviderSessionValue
  promptInteractionKey?: string
}

export type SessionTabsTerminalTabValue =
  | {
      type: 'terminal'
      id: string
      title: string
      parentTabId: string
      leafId: string
      status: 'pending-handle' | 'sleeping'
      terminal: null
      isActive: boolean
      quickCommandLabel?: string | null
      ptyId?: string | null
      color?: string | null
      isPinned?: boolean
      launchAgent?: SessionTabsLaunchAgentValue
      resolvedAgentType?: SessionTabsLaunchAgentValue
      startupCwd?: string
      agentStatus?: SessionTabsAgentStatusValue | null
    }
  | {
      type: 'terminal'
      id: string
      title: string
      parentTabId: string
      leafId: string
      status: 'ready'
      terminal: string
      worktreeInstanceId?: string | null
      isActive: boolean
      quickCommandLabel?: string | null
      ptyId?: string | null
      color?: string | null
      isPinned?: boolean
      launchAgent?: SessionTabsLaunchAgentValue
      resolvedAgentType?: SessionTabsLaunchAgentValue
      startupCwd?: string
      agentStatus?: SessionTabsAgentStatusValue | null
    }

export type SessionTabsMarkdownTabValue = {
  type: 'markdown'
  id: string
  title: string
  filePath: string
  relativePath: string
  language: 'markdown'
  mode: 'edit' | 'markdown-preview'
  isDirty: boolean
  isActive: boolean
  sourceFileId: string
  sourceFilePath: string
  sourceRelativePath: string
  documentVersion: string
  color?: string | null
  isPinned?: boolean
}

export type SessionTabsFileTabValue = {
  type: 'file'
  id: string
  title: string
  filePath: string
  relativePath: string
  language: string
  mode?: 'edit' | 'diff'
  diffSource?: 'staged' | 'unstaged'
  isDirty: boolean
  isActive: boolean
  color?: string | null
  isPinned?: boolean
}

export type SessionTabsBrowserTabValue = {
  type: 'browser'
  id: string
  title: string
  browserWorkspaceId: string
  browserPageId: string | null
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  isActive: boolean
  color?: string | null
  isPinned?: boolean
}

export type SessionTabsTabValue =
  | SessionTabsTerminalTabValue
  | SessionTabsMarkdownTabValue
  | SessionTabsFileTabValue
  | SessionTabsBrowserTabValue

export type SessionTabsTabGroupValue = {
  id: string
  activeTabId: string | null
  tabOrder: string[]
  recentTabIds?: string[]
}

export type SessionTabsGroupLayoutNodeValue =
  | { type: 'leaf'; groupId: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: SessionTabsGroupLayoutNodeValue
      second: SessionTabsGroupLayoutNodeValue
      ratio?: number
    }

export type SessionTabsSnapshotValue = {
  worktree: string
  publicationEpoch: string
  snapshotVersion: number
  activeGroupId: string | null
  activeTabId: string | null
  activeTabType: SessionTabsTabTypeValue | null
  tabGroups?: SessionTabsTabGroupValue[]
  tabGroupLayout?: SessionTabsGroupLayoutNodeValue | null
  tabs: SessionTabsTabValue[]
  removed?: true
}

export type SessionTabsCreateTerminalResultValue = {
  tab: SessionTabsTerminalTabValue
  publicationEpoch: string
  snapshotVersion: number
}

export type SessionTabsStreamEventValue =
  | ({ type: 'snapshot' } & SessionTabsSnapshotValue)
  | ({ type: 'updated' } & SessionTabsSnapshotValue)
  | { type: 'end' }

export type SessionTabsAllStreamEventValue =
  | { type: 'snapshots'; snapshots: SessionTabsSnapshotValue[] }
  | ({ type: 'updated' } & SessionTabsSnapshotValue)
  | { type: 'end' }

export type SessionTabsStartupCommandDeliveryInput = 'fast' | 'shell-ready'

export type SessionTabsCreateTerminalInput = {
  worktree: string
  activate?: boolean
  afterTabId?: string
  agent?: string
  agentPrompt?: string
  clientMutationId?: string
  command?: string
  cwd?: string
  env?: Record<string, string>
  envToDelete?: string[]
  launchAgent?: string
  launchConfig?: {
    agentCommand?: string
    agentArgs: string
    agentEnv: Record<string, string>
    ompResumeFilePath?: string
  }
  launchToken?: string
  startupCommandDelivery?: SessionTabsStartupCommandDeliveryInput
  targetGroupId?: string
}

export type SessionTabsMoveInput = {
  worktree: string
  tabId: string
  targetGroupId: string
  kind: 'reorder' | 'move-to-group' | 'split'
  tabOrder?: string[]
  index?: number
  splitDirection?: 'left' | 'right' | 'up' | 'down'
}

export type SessionTabsSetTabPropsInput = {
  worktree: string
  tabId: string
  color?: string | null
  isPinned?: boolean
}

export type SessionTabsPaneLayoutNodeValue =
  | { type: 'leaf'; leafId: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: SessionTabsPaneLayoutNodeValue
      second: SessionTabsPaneLayoutNodeValue
      ratio?: number
    }

export type SessionTabsUpdatePaneLayoutInput = {
  worktree: string
  tabId: string
  root: SessionTabsPaneLayoutNodeValue | null
  expandedLeafId: string | null
  titlesByLeafId?: Record<string, string>
}

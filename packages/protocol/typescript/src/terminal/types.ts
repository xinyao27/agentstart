export type TerminalAgentPhase = 'thinking' | 'executing' | 'waiting-decision' | 'complete'

export type TerminalSummary = {
  agentPhase?: TerminalAgentPhase | null
  handle: string
  ptyId: string | null
  worktreeId: string
  worktreePath: string
  branch: string
  tabId: string
  leafId: string
  title: string | null
  connected: boolean
  writable: boolean
  lastOutputAt: number | null
  preview: string
}

export type TerminalVisualTerminalNode = {
  type: 'terminal'
  handle: string
  tabId: string
  leafId: string
  title: string | null
  connected: boolean
  active: boolean
}

export type TerminalVisualPaneNode =
  | TerminalVisualTerminalNode
  | {
      type: 'pane-split'
      direction: 'horizontal' | 'vertical'
      first: TerminalVisualPaneNode
      second: TerminalVisualPaneNode
    }

export type TerminalVisualTab = {
  tabId: string
  title: string | null
  activeLeafId: string | null
  panes: TerminalVisualPaneNode
}

export type TerminalVisualGroupNode = {
  type: 'group'
  groupId: string | null
  activeTabId: string | null
  tabs: TerminalVisualTab[]
}

export type TerminalVisualLayoutNode =
  | TerminalVisualGroupNode
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: TerminalVisualLayoutNode
      second: TerminalVisualLayoutNode
    }

export type TerminalVisualLayout = {
  worktreeId: string
  worktreePath: string
  root: TerminalVisualLayoutNode
}

export type TerminalListInput = {
  worktree?: string
  limit?: number
  requireFreshPtyLiveness?: boolean
}

export type TerminalListResult = {
  terminals: TerminalSummary[]
  visualLayouts?: TerminalVisualLayout[]
  totalCount: number
  truncated: boolean
}

export type TerminalViewport = { cols: number; rows: number }

export type TerminalCreateInput = {
  worktree?: string
  viewport?: TerminalViewport
  command?: string
  cwd?: string
  cwdFallback?: 'worktree'
  startupCommandDelivery?: 'fast' | 'shell-ready'
  env?: Record<string, string>
  envToDelete?: string[]
  launchConfig?: {
    ompResumeFilePath?: string
    agentCommand?: string
    agentArgs: string
    agentEnv: Record<string, string>
  }
  launchToken?: string
  launchAgent?: string
  title?: string
  focus?: boolean
  rendererBacked?: boolean
  activate?: boolean
  presentation?: 'background' | 'visible' | 'focused'
  tabId?: string
  leafId?: string
}

export type TerminalCreate = {
  handle: string
  tabId?: string
  paneKey?: string | null
  ptyId?: string | null
  worktreeId: string
  title: string | null
  surface?: 'background' | 'visible'
  warning?: string
  transportGeneration: string
  isReattach: boolean
  sessionExpired: boolean
  restore: {
    kind: 'none' | 'snapshot' | 'replay' | 'cold-restore'
    isAlternateScreen: boolean
    snapshotCols?: number
    snapshotRows?: number
    cwd?: string
    startupCwdFallback?: { kind: 'worktree'; cwd: string }
  }
}

export type TerminalCreateResult = { terminal: TerminalCreate }

export type TerminalReadInput = { terminal: string; cursor?: number; limit?: number }

export type TerminalReadResult = {
  terminal: {
    handle: string
    status: 'running' | 'exited' | 'unknown'
    tail: string[]
    truncated: boolean
    limited?: boolean
    oldestCursor?: string
    nextCursor: string | null
    latestCursor?: string
    returnedLineCount?: number
  }
}

export type TerminalClientIdentity = {
  id: string
  type?: 'mobile' | 'desktop' | 'extension' | 'daemon' | 'cli'
}

export type TerminalSendInput = {
  terminal: string
  text?: string
  enter?: boolean
  interrupt?: boolean
  requireAgentStatus?: 'sendable'
  inputKind?: 'query-reply'
  client?: TerminalClientIdentity
  viewport?: TerminalViewport
  claimViewport?: true
}

export type TerminalSendResult = {
  send: {
    handle: string
    accepted: boolean
    bytesWritten: number
    refusedReason?: 'no-agent' | 'permission'
  }
}

export type TerminalCloseResult = {
  close: { handle: string; tabId: string; ptyKilled: boolean }
}

export type TerminalFocusResult = {
  focus: { handle: string; tabId: string; worktreeId: string }
}

export type ManagedSession = {
  sessionId: string
  state: 'created' | 'spawning' | 'running' | 'exiting' | 'exited'
  shellState: 'pending' | 'ready' | 'timed_out' | 'unsupported'
  isAlive: boolean
  pid: number | null
  cwd: string
  cols: number
  rows: number
  createdAt: number
  protocolVersion: number
}

export type TerminalShowResult = TerminalSummary & {
  paneRuntimeId: number
  rendererGraphEpoch: number
  transportGeneration: string
}

export type TerminalViewAttributesInput = {
  foreground: readonly [number, number, number]
  background: readonly [number, number, number]
  cursor: readonly [number, number, number]
  ansi: readonly (readonly [number, number, number])[]
  colorSchemeMode: 'dark' | 'light'
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
}

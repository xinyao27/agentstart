import type { AiVaultAgent } from '@yiru/protocol/ai-vault/providers'
import type { ExecutionHostId, ExecutionHostScope } from '@yiru/protocol/host/identity'

export type AiVaultSessionPreviewMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'unknown'
  text: string
  timestamp: string | null
}

export type AiVaultSessionDayTokens = {
  day: string
  tokens: number
}

export type AiVaultSessionTokenUsage = {
  provider: string | null
  model: string | null
  timestamp: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

// Terminal statuses come from <task-notification> records in the parent
// transcript; 'running' is inferred from recent transcript activity.
export type AiVaultSubagentRunStatus = 'running' | 'completed' | 'failed' | 'stopped'

// Set only on Task subagent transcript rows (listed on demand under their
// parent session); null for every top-level scanned session.
export type AiVaultSessionSubagentInfo = {
  parentSessionId: string
  agentType: string | null
  status: AiVaultSubagentRunStatus | null
}

export type AiVaultSession = {
  id: string
  executionHostId: ExecutionHostId
  executionHostPlatform?: NodeJS.Platform | null
  agent: AiVaultAgent
  sessionId: string
  title: string
  cwd: string | null
  branch: string | null
  model: string | null
  filePath: string
  codexHome: string | null
  createdAt: string | null
  updatedAt: string | null
  modifiedAt: string
  messageCount: number
  totalTokens: number
  // Why: attributing totalTokens to updatedAt would collapse multi-day sessions into one cell.
  tokensByDay?: AiVaultSessionDayTokens[]
  // Why: Pi and OMP can route one transcript through several providers; retain
  // request identity so cost pricing can follow the underlying provider.
  tokenUsage?: AiVaultSessionTokenUsage[]
  previewMessages: AiVaultSessionPreviewMessage[]
  /** Latest provider-authenticated user prompt; absent when the transcript has no trustworthy signal. */
  lastUserPrompt?: string | null
  // Recoverable signal for sessions whose conversation transcript persisted zero
  // user/assistant turns: queued (never-flushed) prompts survive even when the
  // main conversation was lost.
  queuedMessageCount: number
  // Number of Task subagent transcripts stored beside this session; always 0
  // for agents that don't materialize subagent transcripts. Doubles as the
  // recoverable signal for zero-turn sessions.
  subagentTranscriptCount: number
  resumeCommand: string
  subagent: AiVaultSessionSubagentInfo | null
}

export type AiVaultSubagentListArgs = {
  agent: AiVaultAgent
  parentFilePath: string
  // The session's host. Subagent transcripts are read from the local
  // filesystem, so non-local hosts resolve to an empty list.
  executionHostId?: ExecutionHostId
}

export type AiVaultSubagentListResult = {
  sessions: AiVaultSession[]
  issues: AiVaultScanIssue[]
}

export type AiVaultScanIssue = {
  executionHostId?: ExecutionHostId
  agent: AiVaultAgent
  path: string
  message: string
}

export type AiVaultListArgs = {
  limit?: number
  force?: boolean
  // Active workspace/project paths. The global result is recency-capped, so these
  // guarantee a scoped view still surfaces its own (possibly older) sessions.
  scopePaths?: readonly string[]
  executionHostScope?: ExecutionHostScope
}

export type AiVaultListResult = {
  sessions: AiVaultSession[]
  issues: AiVaultScanIssue[]
  scannedAt: string
}

import type { ProviderUsageSnapshot, ProviderUsageScope, ProviderUsageRange } from './values'

export type ProviderUsageBreakdownKind = 'model' | 'project'

export type ProviderUsageSnapshotInput = {
  scope: ProviderUsageScope
  range: ProviderUsageRange
  limit?: number
}

export type ClaudeUsageScanState = Pick<
  ProviderUsageSnapshot['scanState'],
  | 'enabled'
  | 'isScanning'
  | 'lastScanStartedAt'
  | 'lastScanCompletedAt'
  | 'lastScanError'
  | 'hasAnyClaudeData'
>

export type ClaudeUsageSummary = Pick<
  ProviderUsageSnapshot['summary'],
  | 'scope'
  | 'range'
  | 'sessions'
  | 'turns'
  | 'zeroCacheReadTurns'
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
  | 'cacheReuseRate'
  | 'estimatedCostUsd'
  | 'topModel'
  | 'topProject'
  | 'hasAnyClaudeData'
>

export type ClaudeUsageDailyPoint = Pick<
  ProviderUsageSnapshot['daily'][number],
  | 'day'
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
  | 'estimatedCostUsd'
  | 'unpricedTokens'
>

export type ClaudeUsageBreakdownRow = Pick<
  ProviderUsageSnapshot['modelBreakdown'][number],
  | 'key'
  | 'label'
  | 'sessions'
  | 'turns'
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
  | 'estimatedCostUsd'
>

export type ClaudeUsageSessionRow = Pick<
  ProviderUsageSnapshot['recentSessions'][number],
  | 'sessionId'
  | 'lastActiveAt'
  | 'durationMinutes'
  | 'projectLabel'
  | 'branch'
  | 'model'
  | 'turns'
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
>

export type ClaudeUsageSnapshot = {
  scanState: ClaudeUsageScanState
  summary: ClaudeUsageSummary
  daily: ClaudeUsageDailyPoint[]
  modelBreakdown: ClaudeUsageBreakdownRow[]
  projectBreakdown: ClaudeUsageBreakdownRow[]
  recentSessions: ClaudeUsageSessionRow[]
}

export type CodexUsageScanState = Pick<
  ProviderUsageSnapshot['scanState'],
  | 'enabled'
  | 'isScanning'
  | 'lastScanStartedAt'
  | 'lastScanCompletedAt'
  | 'lastScanError'
  | 'hasAnyCodexData'
>

export type CodexUsageSummary = Pick<
  ProviderUsageSnapshot['summary'],
  | 'scope'
  | 'range'
  | 'sessions'
  | 'events'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'reasoningOutputTokens'
  | 'totalTokens'
  | 'estimatedCostUsd'
  | 'topModel'
  | 'topProject'
  | 'hasAnyCodexData'
>

export type CodexUsageDailyPoint = Pick<
  ProviderUsageSnapshot['daily'][number],
  | 'day'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'reasoningOutputTokens'
  | 'totalTokens'
  | 'estimatedCostUsd'
  | 'unpricedTokens'
>

export type CodexUsageBreakdownRow = Pick<
  ProviderUsageSnapshot['modelBreakdown'][number],
  | 'key'
  | 'label'
  | 'sessions'
  | 'events'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'reasoningOutputTokens'
  | 'totalTokens'
  | 'estimatedCostUsd'
  | 'hasInferredPricing'
>

export type CodexUsageSessionRow = Pick<
  ProviderUsageSnapshot['recentSessions'][number],
  | 'sessionId'
  | 'lastActiveAt'
  | 'durationMinutes'
  | 'projectLabel'
  | 'model'
  | 'events'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'reasoningOutputTokens'
  | 'totalTokens'
  | 'hasInferredPricing'
>

export type CodexUsageSnapshot = {
  scanState: CodexUsageScanState
  summary: CodexUsageSummary
  daily: CodexUsageDailyPoint[]
  modelBreakdown: CodexUsageBreakdownRow[]
  projectBreakdown: CodexUsageBreakdownRow[]
  recentSessions: CodexUsageSessionRow[]
}

export type OpenCodeUsageScanState = Pick<
  ProviderUsageSnapshot['scanState'],
  | 'enabled'
  | 'isScanning'
  | 'lastScanStartedAt'
  | 'lastScanCompletedAt'
  | 'lastScanError'
  | 'hasAnyOpenCodeData'
>

export type OpenCodeUsageSummary = Pick<
  ProviderUsageSnapshot['summary'],
  | 'scope'
  | 'range'
  | 'sessions'
  | 'events'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'reasoningOutputTokens'
  | 'totalTokens'
  | 'estimatedCostUsd'
  | 'topModel'
  | 'topProject'
  | 'hasAnyOpenCodeData'
>

export type OpenCodeUsageDailyPoint = Pick<
  ProviderUsageSnapshot['daily'][number],
  | 'day'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'reasoningOutputTokens'
  | 'totalTokens'
  | 'estimatedCostUsd'
  | 'unpricedTokens'
>

export type OpenCodeUsageBreakdownRow = Pick<
  ProviderUsageSnapshot['modelBreakdown'][number],
  | 'key'
  | 'label'
  | 'sessions'
  | 'events'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'reasoningOutputTokens'
  | 'totalTokens'
  | 'estimatedCostUsd'
>

export type OpenCodeUsageSessionRow = Pick<
  ProviderUsageSnapshot['recentSessions'][number],
  | 'sessionId'
  | 'lastActiveAt'
  | 'durationMinutes'
  | 'projectLabel'
  | 'model'
  | 'events'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'reasoningOutputTokens'
  | 'totalTokens'
>

export type OpenCodeUsageSnapshot = {
  scanState: OpenCodeUsageScanState
  summary: OpenCodeUsageSummary
  daily: OpenCodeUsageDailyPoint[]
  modelBreakdown: OpenCodeUsageBreakdownRow[]
  projectBreakdown: OpenCodeUsageBreakdownRow[]
  recentSessions: OpenCodeUsageSessionRow[]
}

export type ProviderUsageTypesByProvider = {
  claude: { scanState: ClaudeUsageScanState; snapshot: ClaudeUsageSnapshot }
  codex: { scanState: CodexUsageScanState; snapshot: CodexUsageSnapshot }
  openCode: { scanState: OpenCodeUsageScanState; snapshot: OpenCodeUsageSnapshot }
}

export type ClaudeUsageScope = ProviderUsageScope

export type ClaudeUsageRange = ProviderUsageRange

export type ClaudeUsageBreakdownKind = ProviderUsageBreakdownKind

export type CodexUsageScope = ProviderUsageScope

export type CodexUsageRange = ProviderUsageRange

export type CodexUsageBreakdownKind = ProviderUsageBreakdownKind

export type OpenCodeUsageScope = ProviderUsageScope

export type OpenCodeUsageRange = ProviderUsageRange

export type OpenCodeUsageBreakdownKind = ProviderUsageBreakdownKind

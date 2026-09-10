import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ProviderUsageProvider as ProtocolProvider,
  ProviderUsageRange as ProtocolRange,
  ProviderUsageScope as ProtocolScope,
  type ProviderUsageGetSnapshotResponse,
  type ProviderUsageScanState
} from '../../generated/agent_start/runtime/v1/provider_usage_pb.js'
import { RuntimeProtocolError } from '../error.js'

export const PROVIDER_USAGE_PROTOCOL_CAPABILITY = 'providerUsage.protobuf.v1' as const

export type ProviderUsageProvider = 'claude' | 'codex' | 'openCode'
export type ProviderUsageScope = 'agentstart' | 'all'
export type ProviderUsageRange = '7d' | '30d' | '90d' | 'all'

export type ProviderUsageScanStateValue = ReturnType<typeof scanStateFromProtobuf>
export type ProviderUsageSnapshot = ReturnType<typeof snapshotFromProtobuf>

function scopeFromProto(value: string | undefined): ProviderUsageScope {
  return value === 'all' ? 'all' : 'agentstart'
}

function rangeFromProto(value: string | undefined): ProviderUsageRange {
  switch (value) {
    case '30d':
      return '30d'
    case '90d':
      return '90d'
    case 'all':
      return 'all'
    default:
      return '7d'
  }
}

export function toProtocolProvider(provider: ProviderUsageProvider): ProtocolProvider {
  switch (provider) {
    case 'claude':
      return ProtocolProvider.CLAUDE
    case 'codex':
      return ProtocolProvider.CODEX
    case 'openCode':
      return ProtocolProvider.OPEN_CODE
  }
}

export function toProtocolScope(scope: string): ProtocolScope {
  switch (scope) {
    case 'agentstart':
      return ProtocolScope.AGENT_START
    case 'all':
      return ProtocolScope.ALL
    default:
      throw invalidRequest('Provider usage scope is invalid')
  }
}

export function toProtocolRange(range: string): ProtocolRange {
  switch (range) {
    case '7d':
      return ProtocolRange.SEVEN_DAYS
    case '30d':
      return ProtocolRange.THIRTY_DAYS
    case '90d':
      return ProtocolRange.NINETY_DAYS
    case 'all':
      return ProtocolRange.ALL
    default:
      throw invalidRequest('Provider usage range is invalid')
  }
}

export function scanStateFromProtobuf(state: ProviderUsageScanState | undefined): {
  enabled: boolean
  isScanning: boolean
  lastScanStartedAt: number | null
  lastScanCompletedAt: number | null
  lastScanError: string | null
  hasAnyClaudeData: boolean
  hasAnyCodexData: boolean
  hasAnyOpenCodeData: boolean
} {
  if (!state) {
    throw invalidResponse('Provider usage scan state is missing')
  }
  return {
    enabled: state.enabled,
    isScanning: state.isScanning,
    lastScanStartedAt:
      state.lastScanStartedAt === undefined ? null : Number(state.lastScanStartedAt),
    lastScanCompletedAt:
      state.lastScanCompletedAt === undefined ? null : Number(state.lastScanCompletedAt),
    lastScanError: state.lastScanError ?? null,
    hasAnyClaudeData: state.hasAnyClaudeData,
    hasAnyCodexData: state.hasAnyCodexData,
    hasAnyOpenCodeData: state.hasAnyOpenCodeData
  }
}

export function snapshotFromProtobuf(response: ProviderUsageGetSnapshotResponse | undefined): {
  scanState: {
    enabled: boolean
    isScanning: boolean
    lastScanStartedAt: number | null
    lastScanCompletedAt: number | null
    lastScanError: string | null
    hasAnyClaudeData: boolean
    hasAnyCodexData: boolean
    hasAnyOpenCodeData: boolean
  }
  summary: {
    scope: ProviderUsageScope
    range: ProviderUsageRange
    sessions: number
    turns: number
    zeroCacheReadTurns: number
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    events: number
    cacheReuseRate: number | null
    estimatedCostUsd: number | null
    topModel: string | null
    topProject: string | null
    hasAnyClaudeData: boolean
    hasAnyCodexData: boolean
    hasAnyOpenCodeData: boolean
  }
  daily: {
    day: string
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    unpricedTokens: number
    estimatedCostUsd: number | null
  }[]
  modelBreakdown: {
    key: string
    label: string
    sessions: number
    turns: number
    events: number
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    estimatedCostUsd: number | null
    hasInferredPricing: boolean
  }[]
  projectBreakdown: {
    key: string
    label: string
    sessions: number
    turns: number
    events: number
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    estimatedCostUsd: number | null
    hasInferredPricing: boolean
  }[]
  recentSessions: {
    sessionId: string
    lastActiveAt: string
    durationMinutes: number
    projectLabel: string
    turns: number
    events: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    branch: string | null
    model: string | null
    hasInferredPricing: boolean
  }[]
} {
  if (!response) {
    throw invalidResponse('Provider usage snapshot response is missing')
  }
  if (!response.scanState || !response.summary) {
    throw invalidResponse('Provider usage snapshot is missing required fields')
  }
  return {
    scanState: scanStateFromProtobuf(response.scanState),
    summary: {
      scope: scopeFromProto(response.summary.scope),
      range: rangeFromProto(response.summary.range),
      sessions: Number(response.summary.sessions),
      turns: Number(response.summary.turns),
      zeroCacheReadTurns: Number(response.summary.zeroCacheReadTurns),
      inputTokens: Number(response.summary.inputTokens),
      outputTokens: Number(response.summary.outputTokens),
      cachedInputTokens: Number(response.summary.cachedInputTokens),
      cacheReadTokens: Number(response.summary.cacheReadTokens),
      cacheWriteTokens: Number(response.summary.cacheWriteTokens),
      reasoningOutputTokens: Number(response.summary.reasoningOutputTokens),
      totalTokens: Number(response.summary.totalTokens),
      events: Number(response.summary.events),
      cacheReuseRate: response.summary.cacheReuseRate ?? null,
      estimatedCostUsd: response.summary.estimatedCostUsd ?? null,
      topModel: response.summary.topModel ?? null,
      topProject: response.summary.topProject ?? null,
      hasAnyClaudeData: response.summary.hasAnyClaudeData,
      hasAnyCodexData: response.summary.hasAnyCodexData,
      hasAnyOpenCodeData: response.summary.hasAnyOpenCodeData
    },
    daily: response.daily.map((item) => ({
      day: item.day,
      inputTokens: Number(item.inputTokens),
      outputTokens: Number(item.outputTokens),
      cachedInputTokens: Number(item.cachedInputTokens),
      cacheReadTokens: Number(item.cacheReadTokens),
      cacheWriteTokens: Number(item.cacheWriteTokens),
      reasoningOutputTokens: Number(item.reasoningOutputTokens),
      totalTokens: Number(item.totalTokens),
      unpricedTokens: Number(item.unpricedTokens),
      estimatedCostUsd: item.estimatedCostUsd ?? null
    })),
    modelBreakdown: response.modelBreakdown.map((item) => ({
      key: item.key,
      label: item.label,
      sessions: Number(item.sessions),
      turns: Number(item.turns),
      events: Number(item.events),
      inputTokens: Number(item.inputTokens),
      outputTokens: Number(item.outputTokens),
      cachedInputTokens: Number(item.cachedInputTokens),
      cacheReadTokens: Number(item.cacheReadTokens),
      cacheWriteTokens: Number(item.cacheWriteTokens),
      reasoningOutputTokens: Number(item.reasoningOutputTokens),
      totalTokens: Number(item.totalTokens),
      estimatedCostUsd: item.estimatedCostUsd ?? null,
      hasInferredPricing: item.hasInferredPricing
    })),
    projectBreakdown: response.projectBreakdown.map((item) => ({
      key: item.key,
      label: item.label,
      sessions: Number(item.sessions),
      turns: Number(item.turns),
      events: Number(item.events),
      inputTokens: Number(item.inputTokens),
      outputTokens: Number(item.outputTokens),
      cachedInputTokens: Number(item.cachedInputTokens),
      cacheReadTokens: Number(item.cacheReadTokens),
      cacheWriteTokens: Number(item.cacheWriteTokens),
      reasoningOutputTokens: Number(item.reasoningOutputTokens),
      totalTokens: Number(item.totalTokens),
      estimatedCostUsd: item.estimatedCostUsd ?? null,
      hasInferredPricing: item.hasInferredPricing
    })),
    recentSessions: response.recentSessions.map((item) => ({
      sessionId: item.sessionId,
      lastActiveAt: item.lastActiveAt,
      durationMinutes: Number(item.durationMinutes),
      projectLabel: item.projectLabel,
      turns: Number(item.turns),
      events: Number(item.events),
      inputTokens: Number(item.inputTokens),
      cachedInputTokens: Number(item.cachedInputTokens),
      outputTokens: Number(item.outputTokens),
      reasoningOutputTokens: Number(item.reasoningOutputTokens),
      totalTokens: Number(item.totalTokens),
      cacheReadTokens: Number(item.cacheReadTokens),
      cacheWriteTokens: Number(item.cacheWriteTokens),
      branch: item.branch ?? null,
      model: item.model ?? null,
      hasInferredPricing: item.hasInferredPricing
    }))
  }
}

function invalidRequest(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, message)
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  AiVaultHostPlatform,
  AiVaultPreviewRole,
  AiVaultSubagentStatus,
  type AiVaultDayTokens,
  type AiVaultScanIssue,
  type AiVaultSession,
  type AiVaultSubagentInfo,
  type AiVaultTokenUsage
} from '../generated/yiru/runtime/v1/ai_vault_pb.js'
import { RuntimeProtocolError } from './error.js'

export const AI_VAULT_PROTOCOL_CAPABILITY = 'aiVault.protobuf.v1' as const

export type AiVaultHostPlatformName = 'darwin' | 'linux' | 'windows' | 'unknown'

export type AiVaultPreviewRoleName = 'user' | 'assistant' | 'system' | 'tool' | 'unknown'

export type AiVaultSubagentStatusName = 'running' | 'completed' | 'failed' | 'stopped'

export type AiVaultDayTokensRecord = Readonly<{ day: string; tokens: number }>

export type AiVaultTokenUsageRecord = Readonly<{
  cacheReadTokens: number
  cacheWriteTokens: number
  inputTokens: number
  outputTokens: number
  provider: string | null
  model: string | null
  reasoningOutputTokens: number
  timestamp: string | null
  totalTokens: number
}>

export type AiVaultPreviewMessageRecord = Readonly<{
  role: AiVaultPreviewRoleName
  text: string
  timestamp: string | null
}>

export type AiVaultSubagentInfoRecord = Readonly<{
  agentType: string | null
  parentSessionId: string
  status: AiVaultSubagentStatusName | null
}>

export type AiVaultSessionRecord = Readonly<{
  agent: string
  branch: string | null
  codexHome: string | null
  createdAt: string | null
  cwd: string | null
  executionHostId: string
  executionHostPlatform: AiVaultHostPlatformName | null
  filePath: string
  id: string
  lastUserPrompt: string | null
  messageCount: number
  model: string | null
  modifiedAt: string
  previewMessages: AiVaultPreviewMessageRecord[]
  queuedMessageCount: number
  resumeCommand: string
  sessionId: string
  subagent: AiVaultSubagentInfoRecord | null
  subagentTranscriptCount: number
  title: string
  tokensByDay: AiVaultDayTokensRecord[] | null
  tokenUsage: AiVaultTokenUsageRecord[] | null
  totalTokens: number
  updatedAt: string | null
}>

export type AiVaultScanIssueRecord = Readonly<{
  agent: string
  executionHostId: string | null
  message: string
  path: string
}>

export type AiVaultListResultRecord = Readonly<{
  issues: AiVaultScanIssueRecord[]
  scannedAt: string
  sessions: AiVaultSessionRecord[]
}>

export type AiVaultSubagentListResultRecord = Readonly<{
  issues: AiVaultScanIssueRecord[]
  sessions: AiVaultSessionRecord[]
}>

export function aiVaultSession(session: AiVaultSession): AiVaultSessionRecord {
  return {
    agent: session.agent,
    branch: session.branch ?? null,
    codexHome: session.codexHome ?? null,
    createdAt: session.createdAt ?? null,
    cwd: session.cwd ?? null,
    executionHostId: session.executionHostId,
    executionHostPlatform: hostPlatform(session.executionHostPlatform),
    filePath: session.filePath,
    id: session.id,
    lastUserPrompt: session.lastUserPrompt ?? null,
    messageCount: countNumber(session.messageCount, 'AI Vault message count'),
    model: session.model ?? null,
    modifiedAt: session.modifiedAt,
    previewMessages: session.previewMessages.map(previewMessage),
    queuedMessageCount: countNumber(session.queuedMessageCount, 'AI Vault queued message count'),
    resumeCommand: session.resumeCommand,
    sessionId: session.sessionId,
    subagent: session.subagent ? subagentInfo(session.subagent) : null,
    subagentTranscriptCount: countNumber(
      session.subagentTranscriptCount,
      'AI Vault subagent transcript count'
    ),
    title: session.title,
    tokensByDay: session.tokensByDay ? session.tokensByDay.values.map(dayTokens) : null,
    tokenUsage: session.tokenUsage ? session.tokenUsage.values.map(tokenUsage) : null,
    totalTokens: countNumber(session.totalTokens, 'AI Vault token total'),
    updatedAt: session.updatedAt ?? null
  }
}

export function aiVaultScanIssue(issue: AiVaultScanIssue): AiVaultScanIssueRecord {
  return {
    agent: issue.agent,
    executionHostId: issue.executionHostId ?? null,
    message: issue.message,
    path: issue.path
  }
}

function hostPlatform(platform: AiVaultHostPlatform | undefined): AiVaultHostPlatformName | null {
  switch (platform) {
    case undefined:
    case AiVaultHostPlatform.UNSPECIFIED:
      return null
    case AiVaultHostPlatform.DARWIN:
      return 'darwin'
    case AiVaultHostPlatform.LINUX:
      return 'linux'
    case AiVaultHostPlatform.WINDOWS:
      return 'windows'
    case AiVaultHostPlatform.UNKNOWN:
      return 'unknown'
  }
}

function previewMessage(
  message: AiVaultSession['previewMessages'][number]
): AiVaultPreviewMessageRecord {
  return {
    role: previewRole(message.role),
    text: message.text,
    timestamp: message.timestamp ?? null
  }
}

function previewRole(role: AiVaultPreviewRole): AiVaultPreviewRoleName {
  switch (role) {
    case AiVaultPreviewRole.USER:
      return 'user'
    case AiVaultPreviewRole.ASSISTANT:
      return 'assistant'
    case AiVaultPreviewRole.SYSTEM:
      return 'system'
    case AiVaultPreviewRole.TOOL:
      return 'tool'
    case AiVaultPreviewRole.UNSPECIFIED:
    case AiVaultPreviewRole.UNKNOWN:
      return 'unknown'
  }
}

function subagentInfo(info: AiVaultSubagentInfo): AiVaultSubagentInfoRecord {
  return {
    agentType: info.agentType ?? null,
    parentSessionId: info.parentSessionId,
    status: subagentStatus(info.status)
  }
}

function subagentStatus(
  status: AiVaultSubagentStatus | undefined
): AiVaultSubagentStatusName | null {
  switch (status) {
    case undefined:
    case AiVaultSubagentStatus.UNSPECIFIED:
      return null
    case AiVaultSubagentStatus.RUNNING:
      return 'running'
    case AiVaultSubagentStatus.COMPLETED:
      return 'completed'
    case AiVaultSubagentStatus.FAILED:
      return 'failed'
    case AiVaultSubagentStatus.STOPPED:
      return 'stopped'
  }
}

function dayTokens(value: AiVaultDayTokens): AiVaultDayTokensRecord {
  return { day: value.day, tokens: countNumber(value.tokens, 'AI Vault day token count') }
}

function tokenUsage(value: AiVaultTokenUsage): AiVaultTokenUsageRecord {
  return {
    cacheReadTokens: countNumber(value.cacheReadTokens, 'AI Vault cache read tokens'),
    cacheWriteTokens: countNumber(value.cacheWriteTokens, 'AI Vault cache write tokens'),
    inputTokens: countNumber(value.inputTokens, 'AI Vault input tokens'),
    outputTokens: countNumber(value.outputTokens, 'AI Vault output tokens'),
    provider: value.provider ?? null,
    model: value.model ?? null,
    reasoningOutputTokens: countNumber(value.reasoningOutputTokens, 'AI Vault reasoning tokens'),
    timestamp: value.timestamp ?? null,
    totalTokens: countNumber(value.totalTokens, 'AI Vault usage token total')
  }
}

function countNumber(value: bigint, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw invalidResponse(`${label} is outside the safe integer range`)
  }
  return number
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

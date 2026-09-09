import {
  RateLimitResumeProvider as ProtoProvider,
  RateLimitResumeStatus as ProtoStatus,
  RateLimitResumeWindow as ProtoWindow
} from '../generated/yiru/runtime/v1/rate_limit_resume_pb.js'

export const RATE_LIMIT_RESUME_PROTOCOL_CAPABILITY = 'rateLimitResume.protobuf.v1' as const

export type RateLimitResumeProvider =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'opencodeGo'
  | 'kimi'
  | 'antigravity'
  | 'minimax'
  | 'grok'

export type RateLimitResumeWindow = 'session' | 'weekly'

export type RateLimitResumeStatus = 'scheduled' | 'fired' | 'cancelled' | 'stale' | 'failed'

export type RateLimitHit = {
  agent: string
  ptyId: string
  tabId: string
  paneKey: string
  worktreeId: string
  prompt: string
  provider: RateLimitResumeProvider | null
  detectedAt: number
  resetsAt: number | null
  resetDescription: string | null
  window: RateLimitResumeWindow | null
}

export type RateLimitResumeSchedule = RateLimitHit & {
  id: string
  resumeAt: number
  status: RateLimitResumeStatus
  createdAt: number
  firedAt: number | null
  failureReason: string | null
}

export type CodexUsageLimitProbe = {
  ptyId: string
  tabId: string
  paneKey: string
  worktreeId: string
  sessionId: string
  // Why: the legacy contract carried this as optional and callers omit it when
  // the pane has no transcript; the wire field is a plain string, so absence
  // encodes as the empty string.
  transcriptPath?: string
  turnId: string
  prompt: string
}

export function protoProviderToString(provider: number): RateLimitResumeProvider | null {
  switch (provider) {
    case ProtoProvider.CLAUDE:
      return 'claude'
    case ProtoProvider.CODEX:
      return 'codex'
    case ProtoProvider.CURSOR:
      return 'cursor'
    case ProtoProvider.GEMINI:
      return 'gemini'
    case ProtoProvider.OPEN_CODE_GO:
      return 'opencodeGo'
    case ProtoProvider.KIMI:
      return 'kimi'
    case ProtoProvider.ANTIGRAVITY:
      return 'antigravity'
    case ProtoProvider.MINIMAX:
      return 'minimax'
    case ProtoProvider.GROK:
      return 'grok'
    default:
      return null
  }
}

export function stringToProtoProvider(provider: RateLimitResumeProvider | null): number {
  switch (provider) {
    case 'claude':
      return ProtoProvider.CLAUDE
    case 'codex':
      return ProtoProvider.CODEX
    case 'cursor':
      return ProtoProvider.CURSOR
    case 'gemini':
      return ProtoProvider.GEMINI
    case 'opencodeGo':
      return ProtoProvider.OPEN_CODE_GO
    case 'kimi':
      return ProtoProvider.KIMI
    case 'antigravity':
      return ProtoProvider.ANTIGRAVITY
    case 'minimax':
      return ProtoProvider.MINIMAX
    case 'grok':
      return ProtoProvider.GROK
    default:
      return ProtoProvider.UNSPECIFIED
  }
}

export function protoWindowToString(window: number): RateLimitResumeWindow | null {
  switch (window) {
    case ProtoWindow.SESSION:
      return 'session'
    case ProtoWindow.WEEKLY:
      return 'weekly'
    default:
      return null
  }
}

export function stringToProtoWindow(window: RateLimitResumeWindow | null): number {
  switch (window) {
    case 'session':
      return ProtoWindow.SESSION
    case 'weekly':
      return ProtoWindow.WEEKLY
    default:
      return ProtoWindow.UNSPECIFIED
  }
}

export function protoStatusToString(status: number): RateLimitResumeStatus {
  switch (status) {
    case ProtoStatus.SCHEDULED:
      return 'scheduled'
    case ProtoStatus.FIRED:
      return 'fired'
    case ProtoStatus.CANCELLED:
      return 'cancelled'
    case ProtoStatus.STALE:
      return 'stale'
    case ProtoStatus.FAILED:
      return 'failed'
    default:
      return 'scheduled'
  }
}

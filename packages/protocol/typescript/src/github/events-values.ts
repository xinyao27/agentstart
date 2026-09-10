import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import type {
  GitHubPrRefreshEvent as ProtocolPrRefreshEvent,
  GitHubWorkItemMutatedEvent as ProtocolWorkItemMutatedEvent
} from '../../generated/agent_start/runtime/v1/github_pb.js'
import { RuntimeProtocolError } from '../error.js'
import { githubRefreshOutcome, type PRRefreshOutcome } from './pr-values.js'

export type GitHubPRRefreshEvent = {
  sequence: number
  reason: 'visible' | 'active' | 'post-push' | 'manual' | 'swr'
  aliases: {
    cacheKey: string
    repoId: string
    repoPath: string
    branch: string
    connectionId?: string | null
    currentHeadOid?: string | null
    linkedPRNumber?: number | null
    fallbackPRNumber?: number | null
    fallbackPRSource?: 'explicit' | 'pr-cache' | 'hosted-review' | null
    worktreeId?: string
  }[]
} & (
  | { outcome: PRRefreshOutcome; status?: never; pausedUntil?: never; skippedReason?: never }
  | { status: 'queued' | 'in-flight'; outcome?: never; pausedUntil?: never; skippedReason?: never }
  | { status: 'paused'; pausedUntil: number; skippedReason: 'rate-limit'; outcome?: never }
  | { status: 'skipped'; skippedReason: string; outcome?: never; pausedUntil?: never }
)

export type GitHubWorkItemMutatedEvent = { repoPath: string; repoId: string; number: number }

export function githubWorkItemMutatedEvent(
  event: ProtocolWorkItemMutatedEvent
): GitHubWorkItemMutatedEvent {
  return { repoPath: event.repoPath, repoId: event.repoId, number: Number(event.number) }
}

export function githubPrRefreshEvent(event: ProtocolPrRefreshEvent): GitHubPRRefreshEvent {
  const base = {
    sequence: Number(event.sequence),
    reason: refreshReason(event.reason),
    aliases: event.aliases.map((alias) => ({
      cacheKey: alias.cacheKey,
      repoId: alias.repoId,
      repoPath: alias.repoPath,
      branch: alias.branch,
      connectionId: alias.connectionId ?? null,
      currentHeadOid: alias.currentHeadOid ?? null,
      linkedPRNumber: alias.linkedPrNumber !== undefined ? Number(alias.linkedPrNumber) : null,
      fallbackPRNumber:
        alias.fallbackPrNumber !== undefined ? Number(alias.fallbackPrNumber) : null,
      fallbackPRSource: fallbackSource(alias.fallbackPrSource),
      ...(alias.worktreeId ? { worktreeId: alias.worktreeId } : {})
    }))
  }
  switch (event.status.case) {
    case 'queued':
      return { ...base, status: 'queued' }
    case 'inFlight':
      return { ...base, status: 'in-flight' }
    case 'paused':
      return {
        ...base,
        status: 'paused',
        pausedUntil: Number(event.status.value.pausedUntilMs),
        skippedReason: 'rate-limit'
      }
    case 'skipped':
      return { ...base, status: 'skipped', skippedReason: event.status.value.skippedReason }
    case 'completed':
      return { ...base, outcome: githubRefreshOutcome(event.status.value.outcome) }
    default:
      throw invalidResponse('GitHub PR refresh event is missing its status')
  }
}

function refreshReason(value: number): GitHubPRRefreshEvent['reason'] {
  switch (value) {
    case 2:
      return 'active'
    case 3:
      return 'post-push'
    case 4:
      return 'manual'
    case 5:
      return 'swr'
    default:
      return 'visible'
  }
}

function fallbackSource(
  value: number | undefined
): 'explicit' | 'pr-cache' | 'hosted-review' | null {
  switch (value) {
    case 1:
      return 'explicit'
    case 2:
      return 'pr-cache'
    case 3:
      return 'hosted-review'
    default:
      return null
  }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

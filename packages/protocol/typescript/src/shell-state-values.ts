import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ShellOnboardingOutcome,
  type ShellCacheGitHubCache,
  type ShellCacheJsonValue,
  type ShellOnboardingChecklist,
  type ShellOnboardingState
} from '../generated/agent_start/runtime/v1/shell_state_pb.js'
import { RuntimeProtocolError } from './error.js'

export const SHELL_CACHE_PROTOCOL_CAPABILITY = 'shell.cache.protobuf.v1' as const
export const SHELL_ONBOARDING_PROTOCOL_CAPABILITY = 'shell.onboarding.protobuf.v1' as const

export type ShellCachePlainJsonValue =
  | null
  | boolean
  | number
  | string
  | ShellCachePlainJsonValue[]
  | { [key: string]: ShellCachePlainJsonValue }

export type ShellCacheGitHubCacheValue = {
  pr: Record<string, { data: ShellCachePlainJsonValue; fetchedAt: number }>
}

export type ShellOnboardingOutcomeName = 'completed' | 'dismissed'

type ShellOnboardingChecklistValue = {
  addedRepo: boolean
  choseAgent: boolean
  ranFirstAgent: boolean
  ranSecondAgentOnSameTask: boolean
  triedCmdJ: boolean
  shapedSidebar: boolean
  reviewedDiff: boolean
  openedPr: boolean
  addedFolder: boolean
  openedFile: boolean
  ranAgentOnFile: boolean
  dismissed: boolean
}

export type ShellOnboardingStateValue = {
  flowVersion: number
  closedAt: number | null
  outcome: ShellOnboardingOutcomeName | null
  lastCompletedStep: number
  checklist: ShellOnboardingChecklistValue
}

// Why: the GitHub cache payload inside `data` is the raw GitHub API response,
// so the decoder rebuilds plain JSON and leaves the PR document open.
export function shellCacheGitHubCache(value: ShellCacheGitHubCache): ShellCacheGitHubCacheValue {
  const pr: ShellCacheGitHubCacheValue['pr'] = {}
  for (const entry of value.pr) {
    pr[entry.key] = {
      data: entry.value?.data === undefined ? null : plainJson(entry.value.data),
      fetchedAt: entry.value?.fetchedAt ?? 0
    }
  }
  return { pr }
}

export function shellOnboardingState(value: ShellOnboardingState): ShellOnboardingStateValue {
  return {
    flowVersion: safeNumber(value.flowVersion, 'Onboarding flow version'),
    closedAt: value.closedAt ?? null,
    outcome: onboardingOutcome(value.outcome),
    lastCompletedStep: safeNumber(value.lastCompletedStep, 'Onboarding step'),
    checklist: onboardingChecklist(value.checklist)
  }
}

function onboardingChecklist(
  value: ShellOnboardingChecklist | undefined
): ShellOnboardingChecklistValue {
  return {
    addedRepo: value?.addedRepo ?? false,
    choseAgent: value?.choseAgent ?? false,
    ranFirstAgent: value?.ranFirstAgent ?? false,
    ranSecondAgentOnSameTask: value?.ranSecondAgentOnSameTask ?? false,
    triedCmdJ: value?.triedCmdJ ?? false,
    shapedSidebar: value?.shapedSidebar ?? false,
    reviewedDiff: value?.reviewedDiff ?? false,
    openedPr: value?.openedPr ?? false,
    addedFolder: value?.addedFolder ?? false,
    openedFile: value?.openedFile ?? false,
    ranAgentOnFile: value?.ranAgentOnFile ?? false,
    dismissed: value?.dismissed ?? false
  }
}

function onboardingOutcome(
  value: ShellOnboardingOutcome | undefined
): ShellOnboardingOutcomeName | null {
  switch (value) {
    case ShellOnboardingOutcome.COMPLETED:
      return 'completed'
    case ShellOnboardingOutcome.DISMISSED:
      return 'dismissed'
    case undefined:
    case ShellOnboardingOutcome.UNSPECIFIED:
      return null
  }
}

function plainJson(value: ShellCacheJsonValue): ShellCachePlainJsonValue {
  switch (value.kind.case) {
    case undefined:
    case 'nullValue':
      return null
    case 'boolValue':
      return value.kind.value
    case 'numberValue':
      return value.kind.value
    case 'stringValue':
      return value.kind.value
    case 'listValue':
      return value.kind.value.values.map(plainJson)
    case 'objectValue':
      return Object.fromEntries(
        value.kind.value.entries.map((entry) => [
          entry.key,
          entry.value === undefined ? null : plainJson(entry.value)
        ])
      )
  }
}

export function safeNumber(value: bigint, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new RuntimeProtocolError(
      StatusCode.DATA_LOSS,
      `${label} is outside the safe integer range`
    )
  }
  return number
}

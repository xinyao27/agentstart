import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ClaudeManagedAuthMethod,
  CodexSystemAuthKind,
  ManagedAccountRuntime,
  type AccountRoster,
  type AccountsSnapshot as ProtocolAccountsSnapshot,
  type GrokAccountStatus as ProtocolGrokAccountStatus,
  type ManagedAccount,
  type ManagedAccountSelection
} from '../generated/agent_start/runtime/v1/accounts_pb.js'
import type { RateLimitState } from './account-rate-types.js'
import { rateLimitState } from './account-rate-values.js'
import { RuntimeProtocolError } from './error.js'

export { codexRateLimitResetResult, rateLimitState } from './account-rate-values.js'
export type {
  CodexRateLimitResetResult,
  CursorRateLimitRefreshContext,
  InactiveAccountUsage,
  ProviderRateLimits,
  RateLimitRuntimeTarget,
  RateLimitState,
  RateLimitWindow,
  UsageRateLimitFailureKind,
  UsageRateLimitMetadata,
  UsageRateLimitSource
} from './account-rate-types.js'

export const ACCOUNTS_PROTOCOL_CAPABILITY = 'accounts.protobuf.v1' as const

export type ManagedAccountRuntimeSelection = {
  host: string | null
  wsl: Record<string, string | null>
}

export type ClaudeManagedAccount = {
  id: string
  email: string
  managedAuthRuntime: 'host' | 'wsl'
  wslDistro: string | null
  authMethod: 'subscription-oauth' | 'unknown'
  organizationUuid: string | null
  organizationName: string | null
  createdAt: number
  updatedAt: number
  lastAuthenticatedAt: number
}

export type ClaudeAccounts = {
  accounts: ClaudeManagedAccount[]
  activeAccountId: string | null
  activeAccountIdsByRuntime: ManagedAccountRuntimeSelection
}

export type CodexManagedAccount = {
  id: string
  email: string
  managedHomeRuntime: 'host' | 'wsl'
  wslDistro: string | null
  providerAccountId: string | null
  workspaceLabel: string | null
  workspaceAccountId: string | null
  createdAt: number
  updatedAt: number
  lastAuthenticatedAt: number
}

export type CodexSystemIdentity = {
  hasAuth: boolean
  authKind: 'oauth' | 'api-key' | 'none'
  email: string | null
  providerAccountId: string | null
  workspaceLabel: string | null
}

export type CodexAccounts = {
  accounts: CodexManagedAccount[]
  activeAccountId: string | null
  activeAccountIdsByRuntime: ManagedAccountRuntimeSelection
  systemDefault?: CodexSystemIdentity
}

export type ClaudeRateLimitAccountsState = ClaudeAccounts
export type CodexRateLimitAccountsState = CodexAccounts

export type AccountsSnapshot = {
  claude: ClaudeAccounts
  codex: CodexAccounts
  rateLimits: RateLimitState
}

export type AccountsSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string; snapshot: AccountsSnapshot }
  | { type: 'snapshot'; snapshot: AccountsSnapshot }
  | { type: 'end' }

export type GrokAccountStatus = {
  signedIn: boolean
  email: string | null
  teamId: string | null
  tokenFresh: boolean
  error: string | null
}

export function claudeAccounts(roster: AccountRoster | undefined): ClaudeAccounts {
  const value = requiredRoster(roster)
  return {
    accounts: value.accounts.map(claudeAccount),
    activeAccountId: value.activeAccountId ?? null,
    activeAccountIdsByRuntime: accountSelection(value.activeAccountIdsByRuntime)
  }
}

export function codexAccounts(roster: AccountRoster | undefined): CodexAccounts {
  const value = requiredRoster(roster)
  const system = value.systemDefault
  if (!system) {
    throw invalidAccountsResponse('Codex system identity is missing')
  }
  return {
    accounts: value.accounts.map(codexAccount),
    activeAccountId: value.activeAccountId ?? null,
    activeAccountIdsByRuntime: accountSelection(value.activeAccountIdsByRuntime),
    systemDefault: {
      hasAuth: system.hasAuth,
      authKind: systemAuthKind(system.authKind),
      email: system.email ?? null,
      providerAccountId: system.providerAccountId ?? null,
      workspaceLabel: system.workspaceLabel ?? null
    }
  }
}

export function accountsSnapshot(snapshot: ProtocolAccountsSnapshot | undefined): AccountsSnapshot {
  if (!snapshot) {
    throw invalidAccountsResponse('Accounts snapshot is missing')
  }
  return {
    claude: claudeAccounts(snapshot.claude),
    codex: codexAccounts(snapshot.codex),
    rateLimits: rateLimitState(snapshot.rateLimits)
  }
}

export function grokAccountStatus(
  status: ProtocolGrokAccountStatus | undefined
): GrokAccountStatus {
  if (!status) {
    throw invalidAccountsResponse('Grok account status is missing')
  }
  return {
    signedIn: status.signedIn,
    email: status.email ?? null,
    teamId: status.teamId ?? null,
    tokenFresh: status.tokenFresh,
    error: status.error ?? null
  }
}

function claudeAccount(account: ManagedAccount): ClaudeManagedAccount {
  return {
    id: requiredText(account.id, 'Claude account identifier is missing'),
    email: requiredText(account.email, 'Claude account email is missing'),
    managedAuthRuntime: accountRuntime(account.runtime),
    wslDistro: account.wslDistro ?? null,
    authMethod: claudeAuthMethod(account.claudeAuthMethod),
    organizationUuid: account.organizationUuid ?? null,
    organizationName: account.organizationName ?? null,
    createdAt: finiteTimestamp(account.createdAtMs),
    updatedAt: finiteTimestamp(account.updatedAtMs),
    lastAuthenticatedAt: finiteTimestamp(account.lastAuthenticatedAtMs)
  }
}

function codexAccount(account: ManagedAccount): CodexManagedAccount {
  return {
    id: requiredText(account.id, 'Codex account identifier is missing'),
    email: requiredText(account.email, 'Codex account email is missing'),
    managedHomeRuntime: accountRuntime(account.runtime),
    wslDistro: account.wslDistro ?? null,
    providerAccountId: account.providerAccountId ?? null,
    workspaceLabel: account.workspaceLabel ?? null,
    workspaceAccountId: account.workspaceAccountId ?? null,
    createdAt: finiteTimestamp(account.createdAtMs),
    updatedAt: finiteTimestamp(account.updatedAtMs),
    lastAuthenticatedAt: finiteTimestamp(account.lastAuthenticatedAtMs)
  }
}

function accountSelection(selection: ManagedAccountSelection | undefined) {
  if (!selection) {
    throw invalidAccountsResponse('Managed account selection is missing')
  }
  return {
    host: selection.host ?? null,
    wsl: Object.fromEntries(
      selection.wsl.map((entry) => [
        requiredText(entry.distro, 'WSL distribution is missing'),
        entry.accountId ?? null
      ])
    )
  }
}

function accountRuntime(value: ManagedAccountRuntime): 'host' | 'wsl' {
  switch (value) {
    case ManagedAccountRuntime.HOST:
      return 'host'
    case ManagedAccountRuntime.WSL:
      return 'wsl'
    case ManagedAccountRuntime.UNSPECIFIED:
      throw invalidAccountsResponse('Managed account runtime is unspecified')
  }
  throw invalidAccountsResponse('Managed account runtime is unknown')
}

function claudeAuthMethod(value: ClaudeManagedAuthMethod): 'subscription-oauth' | 'unknown' {
  switch (value) {
    case ClaudeManagedAuthMethod.SUBSCRIPTION_OAUTH:
      return 'subscription-oauth'
    case ClaudeManagedAuthMethod.UNKNOWN:
      return 'unknown'
    case ClaudeManagedAuthMethod.UNSPECIFIED:
      throw invalidAccountsResponse('Claude authentication method is unspecified')
  }
  throw invalidAccountsResponse('Claude authentication method is unknown')
}

function systemAuthKind(value: CodexSystemAuthKind): CodexSystemIdentity['authKind'] {
  switch (value) {
    case CodexSystemAuthKind.OAUTH:
      return 'oauth'
    case CodexSystemAuthKind.API_KEY:
      return 'api-key'
    case CodexSystemAuthKind.NONE:
      return 'none'
    case CodexSystemAuthKind.UNSPECIFIED:
      throw invalidAccountsResponse('Codex system authentication kind is unspecified')
  }
  throw invalidAccountsResponse('Codex system authentication kind is unknown')
}

function finiteTimestamp(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw invalidAccountsResponse('Managed account timestamp is invalid')
  }
  return value
}

function requiredRoster(roster: AccountRoster | undefined): AccountRoster {
  if (!roster) {
    throw invalidAccountsResponse('Managed account roster is missing')
  }
  return roster
}

function requiredText(value: string, message: string): string {
  if (!value.trim()) {
    throw invalidAccountsResponse(message)
  }
  return value
}

export function invalidAccountsResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

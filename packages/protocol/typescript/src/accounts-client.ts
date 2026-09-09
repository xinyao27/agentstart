import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import * as P from '../generated/yiru/runtime/v1/accounts_pb.js'
import {
  AccountsAuthenticationClient,
  protocolRuntime,
  type AccountAuthenticationTarget
} from './accounts-authentication-client.js'
import {
  accountsSnapshot,
  claudeAccounts,
  codexAccounts,
  codexRateLimitResetResult,
  grokAccountStatus,
  invalidAccountsResponse,
  rateLimitState,
  type AccountsSnapshot,
  type AccountsSubscriptionEvent,
  type ClaudeAccounts,
  type CodexAccounts,
  type CodexRateLimitResetResult,
  type CursorRateLimitRefreshContext,
  type GrokAccountStatus,
  type RateLimitRuntimeTarget,
  type RateLimitState
} from './accounts-values.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

export type { AccountAuthenticationTarget } from './accounts-authentication-client.js'

export type AccountSelection = AccountAuthenticationTarget & { accountId: string | null }

export type AccountsSubscription = {
  events: AsyncIterable<AccountsSubscriptionEvent>
  cancel: (reason?: string) => Promise<void>
}

export class AccountsClient extends AccountsAuthenticationClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }

  async list(options?: RuntimeCallOptions): Promise<AccountsSnapshot> {
    const payload = await this.unary(
      P.AccountsService.method.list.name,
      P.AccountsServiceListRequestSchema,
      {},
      options
    )
    return accountsSnapshot(fromBinary(P.AccountsServiceListResponseSchema, payload).snapshot)
  }

  async listCachedClaude(options?: RuntimeCallOptions): Promise<ClaudeAccounts> {
    const payload = await this.unary(
      P.AccountsService.method.listCachedClaude.name,
      P.AccountsServiceListCachedClaudeRequestSchema,
      {},
      options
    )
    return claudeAccounts(
      fromBinary(P.AccountsServiceListCachedClaudeResponseSchema, payload).roster
    )
  }

  async listCachedCodex(options?: RuntimeCallOptions): Promise<CodexAccounts> {
    const payload = await this.unary(
      P.AccountsService.method.listCachedCodex.name,
      P.AccountsServiceListCachedCodexRequestSchema,
      {},
      options
    )
    return codexAccounts(fromBinary(P.AccountsServiceListCachedCodexResponseSchema, payload).roster)
  }

  async subscribe(options?: RuntimeCallOptions): Promise<AccountsSubscription> {
    const stream = await this.transport.subscribe({
      method: `/${P.AccountsService.typeName}/${P.AccountsService.method.subscribe.name}`,
      payload: toBinary(
        P.AccountsServiceSubscribeRequestSchema,
        create(P.AccountsServiceSubscribeRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: subscriptionEvents(stream), cancel: stream.cancel }
  }

  selectClaude(input: AccountSelection, options?: RuntimeCallOptions): Promise<ClaudeAccounts> {
    return this.select(P.AccountProvider.CLAUDE, input, options).then(claudeAccounts)
  }

  selectCodex(input: AccountSelection, options?: RuntimeCallOptions): Promise<CodexAccounts> {
    return this.select(P.AccountProvider.CODEX, input, options).then(codexAccounts)
  }

  removeClaude(accountId: string, options?: RuntimeCallOptions): Promise<ClaudeAccounts> {
    return this.remove(P.AccountProvider.CLAUDE, accountId, options).then(claudeAccounts)
  }

  removeCodex(accountId: string, options?: RuntimeCallOptions): Promise<CodexAccounts> {
    return this.remove(P.AccountProvider.CODEX, accountId, options).then(codexAccounts)
  }

  async unsubscribe(subscriptionId: string, options?: RuntimeCallOptions): Promise<boolean> {
    const payload = await this.unary(
      P.AccountsService.method.unsubscribe.name,
      P.AccountsServiceUnsubscribeRequestSchema,
      { subscriptionId },
      options
    )
    return fromBinary(P.AccountsServiceUnsubscribeResponseSchema, payload).unsubscribed
  }

  async refreshRateLimits(
    cursorContext?: CursorRateLimitRefreshContext,
    options?: RuntimeCallOptions
  ): Promise<RateLimitState> {
    const payload = await this.unary(
      P.AccountsService.method.refreshRateLimits.name,
      P.AccountsServiceRefreshRateLimitsRequestSchema,
      cursorContext ? { cursorContext } : {},
      options
    )
    return rateLimitState(
      fromBinary(P.AccountsServiceRefreshRateLimitsResponseSchema, payload).rateLimits
    )
  }

  refreshClaudeRateLimits(target: RateLimitRuntimeTarget, options?: RuntimeCallOptions) {
    return this.refreshTarget(P.AccountProvider.CLAUDE, target, options)
  }

  refreshCodexRateLimits(target: RateLimitRuntimeTarget, options?: RuntimeCallOptions) {
    return this.refreshTarget(P.AccountProvider.CODEX, target, options)
  }

  async consumeCodexResetCredit(options?: RuntimeCallOptions): Promise<CodexRateLimitResetResult> {
    const payload = await this.unary(
      P.AccountsService.method.consumeCodexResetCredit.name,
      P.AccountsServiceConsumeCodexResetCreditRequestSchema,
      {},
      options
    )
    return codexRateLimitResetResult(
      fromBinary(P.AccountsServiceConsumeCodexResetCreditResponseSchema, payload).result
    )
  }

  refreshInactiveClaude(options?: RuntimeCallOptions): Promise<void> {
    return this.refreshInactive(P.AccountProvider.CLAUDE, options)
  }

  refreshInactiveCodex(options?: RuntimeCallOptions): Promise<void> {
    return this.refreshInactive(P.AccountProvider.CODEX, options)
  }

  async refreshGrokRateLimits(options?: RuntimeCallOptions): Promise<RateLimitState> {
    const payload = await this.unary(
      P.AccountsService.method.refreshGrokRateLimits.name,
      P.AccountsServiceRefreshGrokRateLimitsRequestSchema,
      {},
      options
    )
    return rateLimitState(
      fromBinary(P.AccountsServiceRefreshGrokRateLimitsResponseSchema, payload).rateLimits
    )
  }

  async getGrokStatus(options?: RuntimeCallOptions): Promise<GrokAccountStatus> {
    const payload = await this.unary(
      P.AccountsService.method.getGrokStatus.name,
      P.AccountsServiceGetGrokStatusRequestSchema,
      {},
      options
    )
    return grokAccountStatus(
      fromBinary(P.AccountsServiceGetGrokStatusResponseSchema, payload).status
    )
  }

  private async select(
    provider: P.AccountProvider,
    input: AccountSelection,
    options?: RuntimeCallOptions
  ) {
    const payload = await this.unary(
      P.AccountsService.method.select.name,
      P.AccountsServiceSelectRequestSchema,
      {
        provider,
        ...(input.accountId === null ? {} : { accountId: input.accountId }),
        runtime: protocolRuntime(input.runtime),
        ...(input.wslDistro?.trim() ? { wslDistro: input.wslDistro.trim() } : {})
      },
      options
    )
    return fromBinary(P.AccountsServiceSelectResponseSchema, payload).roster
  }

  private async remove(
    provider: P.AccountProvider,
    accountId: string,
    options?: RuntimeCallOptions
  ) {
    const payload = await this.unary(
      P.AccountsService.method.remove.name,
      P.AccountsServiceRemoveRequestSchema,
      { provider, accountId },
      options
    )
    return fromBinary(P.AccountsServiceRemoveResponseSchema, payload).roster
  }

  private async refreshTarget(
    provider: P.AccountProvider,
    target: RateLimitRuntimeTarget,
    options?: RuntimeCallOptions
  ): Promise<RateLimitState> {
    const payload = await this.unary(
      P.AccountsService.method.refreshRateLimitsForTarget.name,
      P.AccountsServiceRefreshRateLimitsForTargetRequestSchema,
      {
        provider,
        target: {
          runtime: protocolRuntime(target.runtime),
          ...(target.wslDistro?.trim() ? { wslDistro: target.wslDistro.trim() } : {})
        }
      },
      options
    )
    return rateLimitState(
      fromBinary(P.AccountsServiceRefreshRateLimitsForTargetResponseSchema, payload).rateLimits
    )
  }

  private async refreshInactive(
    provider: P.AccountProvider,
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      P.AccountsService.method.refreshInactiveAccounts.name,
      P.AccountsServiceRefreshInactiveAccountsRequestSchema,
      { provider },
      options
    )
  }
}

async function* subscriptionEvents(
  stream: RuntimeStream
): AsyncIterable<AccountsSubscriptionEvent> {
  let isReady = false
  for await (const payload of stream.events) {
    const event = fromBinary(P.AccountsServiceSubscribeResponseSchema, payload).event
    switch (event.case) {
      case 'ready':
        isReady = true
        yield {
          type: 'ready',
          subscriptionId: event.value.subscriptionId,
          snapshot: accountsSnapshot(event.value.snapshot)
        }
        break
      case 'snapshot':
        if (!isReady) {
          throw invalidAccountsResponse('Accounts subscription sent a snapshot before ready')
        }
        yield { type: 'snapshot', snapshot: accountsSnapshot(event.value) }
        break
      case 'end':
        yield { type: 'end' }
        return
      case undefined:
        break
    }
  }
  if (!isReady) {
    throw invalidAccountsResponse('Accounts subscription closed before its ready snapshot')
  }
}

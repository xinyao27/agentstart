import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import * as P from '../generated/agent_start/runtime/v1/accounts_pb.js'
import {
  claudeAccounts,
  codexAccounts,
  type ClaudeAccounts,
  type CodexAccounts
} from './accounts-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export type AccountAuthenticationTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
}

export class AccountsAuthenticationClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  addClaude(
    target: AccountAuthenticationTarget = {},
    options?: RuntimeCallOptions
  ): Promise<ClaudeAccounts> {
    return this.add(P.AccountProvider.CLAUDE, target, options).then(claudeAccounts)
  }

  addCodex(
    target: AccountAuthenticationTarget = {},
    options?: RuntimeCallOptions
  ): Promise<CodexAccounts> {
    return this.add(P.AccountProvider.CODEX, target, options).then(codexAccounts)
  }

  reauthenticateClaude(accountId: string, options?: RuntimeCallOptions): Promise<ClaudeAccounts> {
    return this.reauthenticate(P.AccountProvider.CLAUDE, accountId, options).then(claudeAccounts)
  }

  reauthenticateCodex(accountId: string, options?: RuntimeCallOptions): Promise<CodexAccounts> {
    return this.reauthenticate(P.AccountProvider.CODEX, accountId, options).then(codexAccounts)
  }

  async cancelPendingLogin(options?: RuntimeCallOptions): Promise<boolean> {
    const payload = await this.unary(
      P.AccountsService.method.cancelPendingLogin.name,
      P.AccountsServiceCancelPendingLoginRequestSchema,
      {},
      options
    )
    return fromBinary(P.AccountsServiceCancelPendingLoginResponseSchema, payload).cancelled
  }

  async getMiniMaxCredentials(options?: RuntimeCallOptions): Promise<{ configured: boolean }> {
    const payload = await this.unary(
      P.AccountsService.method.getMiniMaxCredentials.name,
      P.AccountsServiceGetMiniMaxCredentialsRequestSchema,
      {},
      options
    )
    return {
      configured: fromBinary(P.AccountsServiceGetMiniMaxCredentialsResponseSchema, payload)
        .configured
    }
  }

  async saveMiniMaxCookie(cookie: string, options?: RuntimeCallOptions) {
    const payload = await this.unary(
      P.AccountsService.method.saveMiniMaxCookie.name,
      P.AccountsServiceSaveMiniMaxCookieRequestSchema,
      { cookie },
      options
    )
    return {
      configured: fromBinary(P.AccountsServiceSaveMiniMaxCookieResponseSchema, payload).configured
    }
  }

  async clearMiniMaxCookie(options?: RuntimeCallOptions) {
    const payload = await this.unary(
      P.AccountsService.method.clearMiniMaxCookie.name,
      P.AccountsServiceClearMiniMaxCookieRequestSchema,
      {},
      options
    )
    return {
      configured: fromBinary(P.AccountsServiceClearMiniMaxCookieResponseSchema, payload).configured
    }
  }

  protected async unary(
    schemaName: string,
    schema: Parameters<typeof create>[0],
    value: Record<string, unknown>,
    options?: RuntimeCallOptions
  ) {
    return this.transport.unary({
      method: `/${P.AccountsService.typeName}/${schemaName}`,
      payload: toBinary(schema, create(schema, value)),
      ...(options ? { options } : {})
    })
  }

  private async add(
    provider: P.AccountProvider,
    target: AccountAuthenticationTarget,
    options?: RuntimeCallOptions
  ) {
    const payload = await this.unary(
      P.AccountsService.method.add.name,
      P.AccountsServiceAddRequestSchema,
      {
        provider,
        runtime: protocolRuntime(target.runtime ?? 'host'),
        ...(target.wslDistro?.trim() ? { wslDistro: target.wslDistro.trim() } : {})
      },
      options
    )
    return fromBinary(P.AccountsServiceAddResponseSchema, payload).roster
  }

  private async reauthenticate(
    provider: P.AccountProvider,
    accountId: string,
    options?: RuntimeCallOptions
  ) {
    const payload = await this.unary(
      P.AccountsService.method.reauthenticate.name,
      P.AccountsServiceReauthenticateRequestSchema,
      { provider, accountId },
      options
    )
    return fromBinary(P.AccountsServiceReauthenticateResponseSchema, payload).roster
  }
}

export function protocolRuntime(runtime?: 'host' | 'wsl'): P.ManagedAccountRuntime {
  return runtime === undefined
    ? P.ManagedAccountRuntime.UNSPECIFIED
    : runtime === 'wsl'
      ? P.ManagedAccountRuntime.WSL
      : P.ManagedAccountRuntime.HOST
}

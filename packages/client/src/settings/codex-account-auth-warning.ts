import type { ProviderRateLimits, RateLimitRuntimeTarget } from '@yiru/protocol/account-rate-types'
import type { CodexSystemDefaultIdentity } from '@yiru/protocol/settings/managed-accounts'
import { isCodexAuthError } from '~renderer/codex-auth-errors'

type AccountRuntime = {
  runtime: 'host' | 'wsl'
  wslDistro?: string | null
}

export function codexRateLimitTargetMatchesAccountRuntime(
  target: RateLimitRuntimeTarget,
  runtime: AccountRuntime
): boolean {
  if (target.runtime !== runtime.runtime) {
    return false
  }
  if (runtime.runtime === 'host') {
    return true
  }
  return !runtime.wslDistro || target.wslDistro === runtime.wslDistro
}

export function getCodexAccountAuthWarning(args: {
  limits: ProviderRateLimits | null
  target: RateLimitRuntimeTarget
  runtime: AccountRuntime
  activeAccountId: string | null
  accountId: string | null
  authKind?: CodexSystemDefaultIdentity['authKind']
}): string | null {
  if (args.accountId !== args.activeAccountId) {
    return null
  }
  // Why: app-server cannot report quota for API-key auth, while `none` is an
  // authoritative signed-out system-default state that needs user attention.
  if (args.accountId === null && args.authKind === 'api-key') {
    return null
  }
  if (args.accountId === null && args.authKind === 'none') {
    return 'No Codex sign-in was found.'
  }
  if (!codexRateLimitTargetMatchesAccountRuntime(args.target, args.runtime)) {
    return null
  }
  if (args.limits?.status !== 'error' || !isCodexAuthError(args.limits.error)) {
    return null
  }
  return args.limits.error?.trim() || 'Codex reported that this sign-in needs re-authentication.'
}

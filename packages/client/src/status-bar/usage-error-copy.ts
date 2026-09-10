import type { ProviderRateLimits } from '@agentstart/protocol/account-rate-types'
import { translate } from '~renderer/i18n/i18n'

export function getProviderDisplayName(provider: ProviderRateLimits['provider']): string {
  if (provider === 'claude') {
    return 'Claude'
  }
  if (provider === 'codex') {
    return 'Codex'
  }
  if (provider === 'cursor') {
    return 'Cursor'
  }
  if (provider === 'gemini') {
    return 'Gemini'
  }
  if (provider === 'opencode-go') {
    return 'OpenCode Go'
  }
  if (provider === 'kimi') {
    return 'Kimi'
  }
  if (provider === 'antigravity') {
    return 'Antigravity'
  }
  if (provider === 'minimax') {
    return 'MiniMax'
  }
  if (provider === 'grok') {
    return 'Grok'
  }
  return provider
}

function isUsageRateLimitError(message: string | null): boolean {
  // Why: Codex app-server's "chatgpt authentication required to read rate
  // limits" mentions rate limits only as the thing it could not read; treat
  // authentication-required failures as auth, never as the user being limited.
  if (!message || /\bauthentication required\b/i.test(message)) {
    return false
  }
  return /\brate[- ]?limits?\b|\brate[- ]?limited\b/i.test(message)
}

function getDelegatedCliRefreshProvider(
  p: ProviderRateLimits
): Extract<ProviderRateLimits['provider'], 'grok' | 'kimi'> | null {
  if (p.usageMetadata?.failureKind !== 'delegated-refresh-required') {
    return null
  }
  // Why: only these providers require a user-run CLI to rotate the read-only
  // session AgentStart consumes; Claude handles the same failure kind in-app.
  return p.provider === 'grok' || p.provider === 'kimi' ? p.provider : null
}

export function getProviderUsageStatusLabel(p: ProviderRateLimits): string {
  const delegatedCliProvider = getDelegatedCliRefreshProvider(p)
  if (delegatedCliProvider === 'grok') {
    return translate('auto.components.status.bar.tooltip.e2c6a4f917', 'Run Grok to refresh')
  }
  if (delegatedCliProvider === 'kimi') {
    return translate('auto.components.status.bar.tooltip.f90b3d7a16', 'Run Kimi to refresh')
  }
  if (p.provider === 'claude') {
    switch (p.usageMetadata?.failureKind) {
      case 'deferred-by-live-session':
        return translate(
          'auto.components.status.bar.tooltip.0d8d7cfe15',
          'Waiting for Claude session'
        )
      case 'stale-token':
      case 'refreshable-credentials-without-token':
      case 'delegated-refresh-required':
        return translate('auto.components.status.bar.tooltip.1804cd8c3f', 'Refreshing sign-in')
      case 'network':
        return translate('auto.components.status.bar.tooltip.f8f0f9d8cc', 'Network issue')
      case 'keychain-unavailable':
        return translate('auto.components.status.bar.tooltip.bf2e739f18', 'Sign-in unavailable')
      case 'cli-unavailable':
      case 'usage-unavailable':
        return translate('auto.components.status.bar.tooltip.f8b8dbed85', 'Usage unavailable')
      case 'missing-credentials':
      case 'missing-scope':
      case 'parse':
      case 'rate-limited':
      case 'server':
      case 'unknown':
      case undefined:
        break
    }
  }
  if (isUsageRateLimitError(p.error)) {
    return translate('auto.components.status.bar.tooltip.7ad719c4bf', 'Limited')
  }
  return translate('auto.components.status.bar.tooltip.e740f92596', 'Refresh failed')
}

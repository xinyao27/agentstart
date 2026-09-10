import type { ProviderRateLimits } from '@agentstart/protocol/account-rate-types'

export function getUsageProviderAccountsSectionId(
  provider: ProviderRateLimits['provider']
): string | null {
  switch (provider) {
    case 'claude':
      return 'accounts-claude'
    case 'codex':
      return 'accounts-codex'
    case 'cursor':
      // Why: Cursor owns its CLI sign-in lifecycle; AgentStart only reads /usage.
      return null
    case 'gemini':
    case 'antigravity':
      // Why: Antigravity usage currently shares Gemini's OAuth configuration.
      return 'accounts-gemini'
    case 'opencode-go':
      return 'accounts-opencode-go'
    case 'minimax':
      return 'accounts-minimax'
    case 'grok':
      return 'accounts-grok'
    case 'kimi':
      // Why: AgentStart observes Kimi's CLI-owned credentials but must not mutate their lifecycle.
      return null
  }
}

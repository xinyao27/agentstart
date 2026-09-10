import type { ProviderRateLimits, RateLimitWindow } from '@agentstart/protocol/account-rate-types'
import { AgentIcon } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import { formatResetCountdown } from '~renderer/status-bar/reset-time'

import { ClaudeIcon, GeminiIcon, MiniMaxIcon, OpenAIIcon, OpenCodeGoIcon } from './icons'
export { getProviderUsageStatusLabel } from './usage-error-copy'

export { formatResetCountdown }

// ---------------------------------------------------------------------------
// Shared icon component
// ---------------------------------------------------------------------------

export function ProviderIcon({ provider }: { provider: string }): React.JSX.Element {
  if (provider === 'codex') {
    return <OpenAIIcon size={13} />
  }
  if (provider === 'cursor') {
    return <AgentIcon agent="cursor" size={14} />
  }
  if (provider === 'gemini') {
    return <GeminiIcon size={13} />
  }
  if (provider === 'opencode-go') {
    return <OpenCodeGoIcon size={13} />
  }
  if (provider === 'kimi') {
    return <AgentIcon agent="kimi" size={13} />
  }
  if (provider === 'antigravity') {
    return <AgentIcon agent="antigravity" size={13} />
  }
  if (provider === 'minimax') {
    return <MiniMaxIcon size={13} />
  }
  if (provider === 'grok') {
    return <AgentIcon agent="grok" size={13} />
  }
  return <ClaudeIcon size={13} />
}

// ---------------------------------------------------------------------------
// Window section derivation
// ---------------------------------------------------------------------------

export function getWindowSections(
  p: ProviderRateLimits
): { label: string; window: RateLimitWindow | null }[] {
  if (p.buckets?.length) {
    const bucketSections = p.buckets.map((b) => ({ label: b.name, window: b as RateLimitWindow }))
    return [
      ...bucketSections,
      {
        label: translate('auto.components.status.bar.tooltip.252c096536', 'Weekly'),
        window: p.weekly
      }
    ]
  }
  const sections: { label: string; window: RateLimitWindow | null }[] = [
    {
      label: translate('auto.components.status.bar.tooltip.94038ad2fa', 'Session'),
      window: p.session
    },
    {
      label: translate('auto.components.status.bar.tooltip.252c096536', 'Weekly'),
      window: p.weekly
    }
  ]
  if (p.fableWeekly !== undefined && p.fableWeekly !== null) {
    sections.push({
      label: translate('auto.components.status.bar.tooltip.a79c64f87e', 'Fable'),
      window: p.fableWeekly
    })
  }
  if (p.monthly !== undefined && p.monthly !== null) {
    sections.push({
      label: translate('auto.components.status.bar.tooltip.7f7f208060', 'Monthly'),
      window: p.monthly
    })
  }
  return sections
}

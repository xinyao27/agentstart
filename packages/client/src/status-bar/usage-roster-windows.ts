import type { ProviderRateLimits, RateLimitWindow } from '@agentstart/protocol/account-rate-types'
import { formatWindowLabel } from '~renderer/status-bar/window-label-formatter'

import { formatResetCountdown, getWindowSections } from './tooltip'
import { clampUsedPercent } from './usage-percentage'

export type UsageSection = { label: string; window: RateLimitWindow }

export function getUsedUsageSections(provider: ProviderRateLimits): UsageSection[] {
  return getWindowSections(provider).filter(
    (section): section is UsageSection => section.window !== null
  )
}

export function getUsageSectionShortLabel(
  provider: ProviderRateLimits,
  section: UsageSection
): string {
  if (provider.buckets?.some((bucket) => bucket.name === section.label)) {
    return section.label
  }
  if (section.window === provider.fableWeekly) {
    return 'Fable'
  }
  return formatWindowLabel(section.window.windowMinutes)
}

export function getTightestUsageSection(provider: ProviderRateLimits): UsageSection | null {
  const sections = getUsedUsageSections(provider)
  if (sections.length === 0) {
    return null
  }
  // Why: urgency follows consumption even when the user displays the complementary remaining value.
  const tightest = sections.reduce((current, candidate) =>
    clampUsedPercent(candidate.window.usedPercent) > clampUsedPercent(current.window.usedPercent)
      ? candidate
      : current
  )
  return tightest
}

export function getProviderMaxUsed(provider: ProviderRateLimits): number {
  const sections = getUsedUsageSections(provider)
  return sections.length > 0
    ? Math.max(...sections.map((section) => clampUsedPercent(section.window.usedPercent)))
    : 0
}

export function getSoonestUsageResetLabel(
  sections: readonly UsageSection[],
  now: number
): string | null {
  const resets = sections
    .map((section) => section.window.resetsAt)
    .filter((reset): reset is number => typeof reset === 'number' && Number.isFinite(reset))
  return resets.length > 0 ? formatResetCountdown(Math.min(...resets) - now) : null
}

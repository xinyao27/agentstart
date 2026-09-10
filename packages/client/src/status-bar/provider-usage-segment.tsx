import type { ProviderRateLimits } from '@agentstart/protocol/account-rate-types'
import type { StatusBarUsageMode } from '@agentstart/protocol/settings/usage-display'
import type { UsagePercentageDisplay } from '@agentstart/protocol/settings/usage-display'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle } from '~renderer/icons/hugeicons'
import { Progress } from '~renderer/ui/progress'

import { getProviderUsageStatusLabel, ProviderIcon } from './tooltip'
import { clampUsedPercent, getDisplayedUsagePercentage } from './usage-percentage'
import { formatUsagePercentageLabel } from './usage-percentage-label'
import { getUsageUrgency, usageTextColorClass } from './usage-roster-formatting'
import {
  getTightestUsageSection,
  getUsageSectionShortLabel,
  getUsedUsageSections,
  type UsageSection
} from './usage-roster-windows'

// Why: only primary provider buckets earn space in compact usage surfaces;
// secondary model buckets stay available in the detailed usage panel.
const STATUS_BAR_BUCKET_NAMES: Partial<
  Record<ProviderRateLimits['provider'], ReadonlySet<string>>
> = {
  cursor: new Set(['Included', 'Auto', 'API']),
  gemini: new Set(['Flash', 'Pro', '1.5 Pro'])
}
export function UsageWindowMeter({
  label,
  usedPercent,
  display
}: {
  label: string
  usedPercent: number
  display: UsagePercentageDisplay
}): React.JSX.Element {
  const used = clampUsedPercent(usedPercent)
  const shown = getDisplayedUsagePercentage(usedPercent, display)

  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="text-muted-foreground text-[11px]">
        {label}
      </span>
      <Progress
        value={shown}
        variant="muted"
        size="xs"
        tone={getUsageUrgency(used)}
        aria-label={label}
        aria-valuetext={formatUsagePercentageLabel(usedPercent, display)}
      />
      <span aria-hidden className={`text-[11px] tabular-nums ${usageTextColorClass(used)}`}>
        {shown}%
      </span>
    </span>
  )
}

function getStatusBarUsageSections(limits: ProviderRateLimits): UsageSection[] {
  if (limits.buckets && limits.buckets.length > 0) {
    const visibleBucketNames = STATUS_BAR_BUCKET_NAMES[limits.provider]
    const visibleBuckets = visibleBucketNames
      ? limits.buckets.filter((bucket) => visibleBucketNames.has(bucket.name))
      : []
    if (visibleBuckets.length > 0) {
      return visibleBuckets.map((bucket) => ({ label: bucket.name, window: bucket }))
    }
    return limits.session
      ? [
          {
            label: translate('auto.components.status.bar.tooltip.94038ad2fa', 'Session'),
            window: limits.session
          }
        ]
      : []
  }

  // Why: unified-billing providers expose only a monthly window; providers
  // with shorter windows keep monthly details in the provider panel.
  return getUsedUsageSections(limits).filter(
    (section) => section.window !== limits.monthly || (!limits.session && !limits.weekly)
  )
}

export function ProviderUsageSegment({
  limits,
  compact,
  display,
  mode = 'verbose'
}: {
  limits: ProviderRateLimits | null
  compact: boolean
  display: UsagePercentageDisplay
  mode?: StatusBarUsageMode
}): React.JSX.Element {
  const provider = limits?.provider ?? 'claude'
  const statusLabel = limits ? getProviderUsageStatusLabel(limits) : ''

  if (!limits || limits.status === 'idle') {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <ProviderIcon provider={provider} />
        <span className="animate-pulse">···</span>
      </span>
    )
  }

  const tightest = getTightestUsageSection(limits)

  if (limits.status === 'fetching' && !tightest) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <ProviderIcon provider={provider} />
        <span className="animate-pulse">···</span>
      </span>
    )
  }

  if (limits.status === 'unavailable') {
    return (
      <span className="text-muted-foreground/50 inline-flex items-center gap-1">
        <ProviderIcon provider={provider} /> --
      </span>
    )
  }

  if (limits.status === 'error' && !tightest) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <ProviderIcon provider={provider} />
        <AlertTriangle size={11} className="text-muted-foreground/80" />
        {!compact ? <span className="text-[11px] font-medium">{statusLabel}</span> : null}
      </span>
    )
  }

  const isStale = limits.status === 'error'
  if (mode === 'compact') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <ProviderIcon provider={provider} />
        {tightest ? (
          <UsageWindowMeter
            label={getUsageSectionShortLabel(limits, tightest)}
            usedPercent={tightest.window.usedPercent}
            display={display}
          />
        ) : null}
        {isStale ? <AlertTriangle size={11} className="text-muted-foreground/80" /> : null}
      </span>
    )
  }

  const visibleSections = getStatusBarUsageSections(limits)

  return (
    <span className="inline-flex items-center gap-1.5">
      <ProviderIcon provider={provider} />
      <span className="inline-flex items-center gap-2.5">
        {visibleSections.map((section, index) => (
          <UsageWindowMeter
            key={`${section.label}-${index}`}
            label={getUsageSectionShortLabel(limits, section)}
            usedPercent={section.window.usedPercent}
            display={display}
          />
        ))}
      </span>
      {isStale ? <AlertTriangle size={11} className="text-muted-foreground/80" /> : null}
    </span>
  )
}

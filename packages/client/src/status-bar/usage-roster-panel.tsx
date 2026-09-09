import type { ProviderRateLimits } from '@yiru/protocol/account-rate-types'
import type { StatusBarUsageMode } from '@yiru/protocol/settings/usage-display'
import type { UsagePercentageDisplay } from '@yiru/protocol/settings/usage-display'
import { Fragment, type ReactNode } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretRight, ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { SettingsSegmentedControl } from '~renderer/settings/form-controls'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { UsageWindowMeter } from './provider-usage-segment'
import { ProviderIcon } from './tooltip'
import { getProviderDisplayName } from './usage-error-copy'
import { formatPlanLabel } from './usage-roster-formatting'
import { getUsageRosterRowState, type UsageRosterRowState } from './usage-roster-row-state'
import {
  getProviderMaxUsed,
  getSoonestUsageResetLabel,
  getUsageSectionShortLabel,
  getUsedUsageSections
} from './usage-roster-windows'
import { useResetCountdownClock } from './use-reset-countdown-clock'

type ProviderId = ProviderRateLimits['provider']

export function UsageRow({
  provider,
  display,
  state,
  showSignInAction,
  now
}: {
  provider: ProviderRateLimits
  display: UsagePercentageDisplay
  state: UsageRosterRowState
  showSignInAction: boolean
  now: number
}): React.JSX.Element {
  const sections = getUsedUsageSections(provider)
  const hasUsage = sections.length > 0
  const plan = formatPlanLabel(provider.planType)
  const reset = hasUsage ? getSoonestUsageResetLabel(sections, now) : null

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-center gap-2.5">
        <span className="border-border bg-secondary flex size-5 shrink-0 items-center justify-center border">
          <ProviderIcon provider={provider.provider} />
        </span>
        <span className="text-foreground min-w-0 shrink truncate text-xs font-medium">
          {getProviderDisplayName(provider.provider)}
          {plan ? <span className="text-muted-foreground font-normal"> · {plan}</span> : null}
        </span>
        {!hasUsage ? (
          <>
            <span className="text-muted-foreground min-w-0 truncate text-[11px]">
              {state.statusLabel}
            </span>
            {showSignInAction ? (
              <Badge variant="secondary" size="xs" className="ml-auto">
                {translate('auto.components.status.bar.StatusBar.c35af53b73', 'Sign in')}
              </Badge>
            ) : null}
          </>
        ) : reset ? (
          <span className="text-muted-foreground shrink-0 text-[11px]">{reset}</span>
        ) : null}
      </div>
      {hasUsage ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-[30px]">
          {sections.map((section) => {
            return (
              <UsageWindowMeter
                key={section.label}
                label={getUsageSectionShortLabel(provider, section)}
                usedPercent={section.window.usedPercent}
                display={display}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function UsageRosterPanel({
  providers,
  display,
  statusBarUsageMode,
  onStatusBarUsageModeChange,
  isRefreshing,
  onRefresh,
  onOpenProvider,
  onSignIn,
  canSignIn,
  onManageAccounts,
  onStatusBarSettings,
  onUsageDetails,
  renderRow
}: {
  providers: ProviderRateLimits[]
  display: UsagePercentageDisplay
  statusBarUsageMode: StatusBarUsageMode
  onStatusBarUsageModeChange: (mode: StatusBarUsageMode) => void
  isRefreshing: boolean
  onRefresh: () => void
  onOpenProvider: (provider: ProviderId) => void
  onSignIn: (provider: ProviderId) => void
  canSignIn: (provider: ProviderId) => boolean
  onManageAccounts: () => void
  onStatusBarSettings: () => void
  onUsageDetails: () => void
  renderRow?: (provider: ProviderRateLimits, row: ReactNode) => ReactNode
}): React.JSX.Element {
  // Why: one boundary-scheduled clock keeps every open row current without one timer per provider.
  const now = useResetCountdownClock(
    providers.flatMap((provider) =>
      getUsedUsageSections(provider).map((section) => section.window.resetsAt)
    )
  )
  const sorted = [...providers].sort(
    (left, right) => getProviderMaxUsed(right) - getProviderMaxUsed(left)
  )

  return (
    <div className="w-[360px] text-xs">
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <span className="text-foreground text-sm font-semibold">
          {translate('auto.components.status.bar.UsageRosterPanel.title', 'Usage')}
        </span>
        <div className="text-muted-foreground flex items-center gap-2">
          <span className="text-[11px]">
            {translate('auto.components.status.bar.UsageRosterPanel.allAgents', 'visible agents')}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="quiet"
                  size="icon-xs"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  aria-label={translate(
                    'auto.components.status.bar.StatusBar.3325d996cb',
                    'Refresh rate limits'
                  )}
                >
                  {isRefreshing ? <LoadingIndicator className="size-3" /> : <RefreshCw />}
                </Button>
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.status.bar.StatusBar.c8857b40f7', 'Refresh usage data')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="px-3.5 pb-2.5">
        <SettingsSegmentedControl<StatusBarUsageMode>
          value={statusBarUsageMode}
          onChange={onStatusBarUsageModeChange}
          ariaLabel={translate(
            'auto.components.status.bar.UsageRosterPanel.footerDetailAria',
            'Usage footer detail'
          )}
          size="sm"
          equalWidth
          options={[
            {
              value: 'verbose',
              label: translate('auto.components.status.bar.UsageRosterPanel.detailed', 'Detailed')
            },
            {
              value: 'compact',
              label: translate('auto.components.status.bar.UsageRosterPanel.compact', 'Compact')
            }
          ]}
        />
      </div>
      <DropdownMenuSeparator className="my-0" />
      {sorted.map((provider) => {
        const state = getUsageRosterRowState(provider, getUsedUsageSections(provider).length > 0)
        const showSignInAction = state.kind === 'sign-in' && canSignIn(provider.provider)
        const row = (
          <UsageRow
            provider={provider}
            display={display}
            state={state}
            showSignInAction={showSignInAction}
            now={now}
          />
        )
        if (showSignInAction) {
          return (
            <DropdownMenuItem
              key={provider.provider}
              onClick={() => onSignIn(provider.provider)}
              className="w-full"
            >
              {row}
            </DropdownMenuItem>
          )
        }
        const customRow = renderRow?.(provider, row)
        if (customRow) {
          return <Fragment key={provider.provider}>{customRow}</Fragment>
        }
        return (
          <DropdownMenuItem
            key={provider.provider}
            onClick={() => onOpenProvider(provider.provider)}
            className="w-full"
          >
            {row}
          </DropdownMenuItem>
        )
      })}
      <DropdownMenuSeparator className="my-0" />
      <DropdownMenuItem onClick={onUsageDetails} className="w-full justify-between">
        {translate('auto.components.status.bar.UsageRosterPanel.usageDetails', 'Usage overview')}
        <CaretRight className="text-muted-foreground" />
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onStatusBarSettings} className="w-full justify-between">
        {translate(
          'auto.components.status.bar.UsageRosterPanel.statusBarSettings',
          'Status bar settings…'
        )}
        <CaretRight className="text-muted-foreground" />
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onManageAccounts} className="w-full justify-between">
        {translate('auto.components.status.bar.StatusBar.75ded02687', 'Manage Accounts…')}
        <CaretRight className="text-muted-foreground" />
      </DropdownMenuItem>
    </div>
  )
}

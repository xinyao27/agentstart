import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { CodexRateLimitAccountsState } from '@yiru/protocol/settings/managed-accounts'
import { translate } from '~renderer/i18n/i18n'
import { ArrowClockwise as RefreshCw, Trash as Trash2 } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { selectCodexProviderAccount } from '~renderer/runtime/provider-accounts-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import type { AccountRuntime } from './account-runtime'
import { formatAccountTimestamp, getCodexAccountRuntimeLabel } from './account-runtime'
import { getCodexAccountAuthWarning } from './codex-account-auth-warning'
import {
  getProviderAccountRuntime,
  providerAccountIsActiveInView,
  type ProviderAccountRuntimeView
} from './provider-account-visibility'
import type { ProviderAccountAction } from './use-provider-accounts'

type CodexAccountRowProps = {
  account: CodexRateLimitAccountsState['accounts'][number]
  accountRuntime: AccountRuntime
  accountRuntimeUnavailable: boolean
  accountVisibilityOptions: {
    remoteOwner: boolean
    ownerPlatform: NodeJS.Platform | null
  }
  activeCodexAccountId: string | null
  codexAccounts: CodexRateLimitAccountsState
  codexAction: ProviderAccountAction
  isRemoteAccountScope: boolean
  onRemove: (target: { id: string; runtime: ProviderAccountRuntimeView }) => void
  runCodexAccountAction: (
    action: ProviderAccountAction,
    operation: () => Promise<CodexRateLimitAccountsState>,
    actionRuntime?: ProviderAccountRuntimeView
  ) => Promise<void>
  settings: GlobalSettings
}

export function CodexAccountRow({
  account,
  accountRuntime,
  accountRuntimeUnavailable,
  accountVisibilityOptions,
  activeCodexAccountId,
  codexAccounts,
  codexAction,
  isRemoteAccountScope,
  onRemove,
  runCodexAccountAction,
  settings
}: CodexAccountRowProps): React.JSX.Element {
  const codexRateLimits = useAppStore((state) => state.rateLimits.codex)
  const codexRateLimitTarget = useAppStore((state) => state.rateLimits.codexTarget)
  const isActive = providerAccountIsActiveInView(
    account,
    codexAccounts,
    accountRuntime,
    accountVisibilityOptions
  )
  const accountAuthWarning = isRemoteAccountScope
    ? null
    : getCodexAccountAuthWarning({
        limits: codexRateLimits,
        target: codexRateLimitTarget,
        runtime: accountRuntime,
        activeAccountId: activeCodexAccountId,
        accountId: account.id
      })
  const needsReauthentication = Boolean(accountAuthWarning)
  const isReauthing = codexAction === `reauth:${account.id}`
  const isRemoving = codexAction === `remove:${account.id}`
  const isBusy = codexAction !== 'idle' || accountRuntimeUnavailable

  return (
    <div
      className={cn(
        'flex w-full items-center justify-between gap-3 border px-3 py-2.5 text-left transition-colors',
        needsReauthentication
          ? 'border-destructive/50 bg-destructive/5'
          : isActive
            ? 'border-foreground/20 bg-accent/15'
            : 'border-border/70 hover:border-border hover:bg-accent/8'
      )}
    >
      <div className="flex w-full items-center justify-between gap-3 max-md:flex-col max-md:items-start">
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() => {
            const runtime = getProviderAccountRuntime(account)
            void runCodexAccountAction(
              `select:${account.id}`,
              () => selectCodexProviderAccount(settings, { accountId: account.id, ...runtime }),
              runtime
            )
          }}
          disabled={isBusy}
          className="focus-visible:bg-accent flex h-auto min-w-0 flex-1 flex-col justify-start gap-0.5 border-0 p-0 text-left font-normal whitespace-normal disabled:cursor-default"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{account.email}</span>
            <Badge
              variant="outline"
              className="text-foreground/70 h-4 shrink-0 px-1.5 text-[10px] leading-none font-medium"
            >
              {getCodexAccountRuntimeLabel(account, accountRuntime.label)}
            </Badge>
            {isActive ? (
              <Badge
                variant="outline"
                className="text-foreground/80 h-4 shrink-0 px-1.5 text-[10px] leading-none font-medium"
              >
                {translate('auto.components.settings.AccountsPane.e74831fb6b', 'Active')}
              </Badge>
            ) : null}
            {needsReauthentication ? (
              <Badge
                variant="destructive"
                className="h-4 shrink-0 px-1.5 text-[10px] leading-none font-medium"
              >
                {translate('auto.components.settings.AccountsPane.589eba1eee', 'Needs re-auth')}
              </Badge>
            ) : null}
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center gap-1.5 text-[11px] max-sm:flex-wrap',
              needsReauthentication ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {needsReauthentication ? (
              <span className="truncate">
                {translate(
                  'auto.components.settings.AccountsPane.3d245ef7d9',
                  'Codex reported this sign-in is out of date'
                )}
              </span>
            ) : account.workspaceLabel ? (
              <span className="truncate">{account.workspaceLabel}</span>
            ) : null}
            {needsReauthentication || account.workspaceLabel ? (
              <span className="shrink-0 opacity-50">•</span>
            ) : null}
            <span className="shrink-0">{formatAccountTimestamp(account.lastAuthenticatedAt)}</span>
          </div>
        </Button>
        <div className="flex shrink-0 items-center justify-end gap-1 max-md:w-full max-md:flex-wrap">
          <Button
            variant="quiet"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              void runCodexAccountAction(
                `reauth:${account.id}`,
                () => shellClient.accounts.codex.reauthenticate({ accountId: account.id }),
                getProviderAccountRuntime(account)
              )
            }}
            disabled={isRemoteAccountScope || isBusy}
            className="h-6 px-2"
          >
            {isReauthing ? (
              <LoadingIndicator className="size-3" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {translate('auto.components.settings.AccountsPane.8a0f870153', 'Re-authenticate')}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              onRemove({ id: account.id, runtime: getProviderAccountRuntime(account) })
            }}
            disabled={isBusy}
            className="text-muted-foreground hover:text-destructive h-6 px-2"
          >
            {isRemoving ? <LoadingIndicator className="size-3" /> : <Trash2 className="size-3" />}
            {translate('auto.components.settings.AccountsPane.db209ee572', 'Remove')}
          </Button>
        </div>
      </div>
    </div>
  )
}

import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { ClaudeRateLimitAccountsState } from '@agentstart/protocol/settings/managed-accounts'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Plus, ArrowClockwise as RefreshCw, Trash as Trash2, X } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import {
  removeClaudeProviderAccount,
  selectClaudeProviderAccount
} from '~renderer/runtime/provider-accounts-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { ClaudeIcon } from '~renderer/status-bar/icons'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Label } from '~renderer/ui/label'

import type { AccountRuntime } from './account-runtime'
import { formatAccountTimestamp, getClaudeAccountRuntimeLabel } from './account-runtime'
import {
  getProviderAccountRuntime,
  providerAccountIsActiveInView,
  type ProviderAccountRuntimeView
} from './provider-account-visibility'
import { SearchableSetting } from './searchable-setting'
import type { ProviderAccountAction } from './use-provider-accounts'

type ClaudeAccountsSectionProps = {
  accountRuntime: AccountRuntime
  accountRuntimeSentenceLabel: string
  accountRuntimeUnavailable: boolean
  accountVisibilityOptions: {
    remoteOwner: boolean
    ownerPlatform: NodeJS.Platform | null
  }
  claudeAccounts: ClaudeRateLimitAccountsState
  claudeAction: ProviderAccountAction
  isRemoteAccountScope: boolean
  runClaudeAccountAction: (
    action: ProviderAccountAction,
    operation: () => Promise<ClaudeRateLimitAccountsState>,
    actionRuntime?: ProviderAccountRuntimeView
  ) => Promise<void>
  settings: GlobalSettings
  systemClaudeActive: boolean
  visibleClaudeAccounts: ClaudeRateLimitAccountsState['accounts']
  wslCapabilitiesLoading: boolean
}

export function ClaudeAccountsSection({
  accountRuntime,
  accountRuntimeSentenceLabel,
  accountRuntimeUnavailable,
  accountVisibilityOptions,
  claudeAccounts,
  claudeAction,
  isRemoteAccountScope,
  runClaudeAccountAction,
  settings,
  systemClaudeActive,
  visibleClaudeAccounts,
  wslCapabilitiesLoading
}: ClaudeAccountsSectionProps): React.JSX.Element {
  const [removeClaudeTarget, setRemoveClaudeTarget] = useState<{
    id: string
    runtime: ProviderAccountRuntimeView
  } | null>(null)

  return (
    <>
      <Dialog
        open={removeClaudeTarget !== null}
        onOpenChange={(open) => !open && setRemoveClaudeTarget(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {translate(
                'auto.components.settings.AccountsPane.63843e37e2',
                'Remove Claude Account?'
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.settings.AccountsPane.854ebbcc45',
                'AgentStart will delete the managed Claude auth for this saved account. If it is currently active, AgentStart falls back to the system default Claude login.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveClaudeTarget(null)}>
              {translate('auto.components.settings.AccountsPane.dbb9626ed1', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = removeClaudeTarget
                if (!target) {
                  return
                }
                setRemoveClaudeTarget(null)
                void runClaudeAccountAction(
                  `remove:${target.id}`,
                  () => removeClaudeProviderAccount(settings, target.id),
                  target.runtime
                )
              }}
            >
              {translate('auto.components.settings.AccountsPane.c2d2751587', 'Remove Account')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <section id="accounts-claude" className="scroll-mt-6 space-y-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ClaudeIcon size={16} />
            {translate('auto.components.settings.AccountsPane.26ef4b55be', 'Claude')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.AccountsPane.72b36ea174',
              'Optional. AgentStart can use your normal Claude login; add accounts only if you want quick switching without moving chat sessions.'
            )}
          </p>
        </div>

        <SearchableSetting
          title={translate('auto.components.settings.AccountsPane.8bbfd74556', 'Claude Accounts')}
          description={translate(
            'auto.components.settings.AccountsPane.79e484c3b2',
            'Optional account switcher for the shared Claude auth files.'
          )}
          keywords={['claude', 'account', 'rate limit', 'status bar', 'quota']}
          className="space-y-3 py-2"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label>
                {translate('auto.components.settings.AccountsPane.94d351af4a', 'Accounts')}
              </Label>
              <p className="text-muted-foreground text-xs">
                {isRemoteAccountScope
                  ? translate(
                      'auto.components.settings.AccountsPane.remoteScopeAccounts',
                      'Showing accounts managed by {{value0}}. Add or re-authenticate accounts on that server.',
                      { value0: accountRuntimeSentenceLabel }
                    )
                  : translate(
                      'auto.components.settings.AccountsPane.c0a52abfc5',
                      'Showing accounts for {{value0}}. New accounts are added there.',
                      { value0: accountRuntimeSentenceLabel }
                    )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() =>
                  void runClaudeAccountAction('adding', () =>
                    shellClient.accounts.claude.add({
                      runtime: accountRuntime.runtime,
                      wslDistro: accountRuntime.wslDistro
                    })
                  )
                }
                disabled={
                  // Why: interactive `claude login` needs a desktop browser and
                  // would authenticate against this device, not the server.
                  isRemoteAccountScope ||
                  claudeAction !== 'idle' ||
                  wslCapabilitiesLoading ||
                  accountRuntimeUnavailable
                }
                className="gap-1.5"
              >
                {claudeAction === 'adding' ? (
                  <LoadingIndicator className="size-3" />
                ) : (
                  <Plus className="size-3" />
                )}
                {translate('auto.components.settings.AccountsPane.b0e948a4f9', 'Add Account')}
              </Button>
              {claudeAction === 'adding' ? (
                <Button
                  variant="quiet"
                  size="xs"
                  onClick={() => void shellClient.accounts.claude.cancelPendingLogin()}
                  className="gap-1.5"
                >
                  <X className="size-3" />
                  {translate('auto.components.settings.AccountsPane.dbb9626ed1', 'Cancel')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Button
              variant="outline"
              size="default"
              type="button"
              onClick={() =>
                void runClaudeAccountAction('select:system', () =>
                  selectClaudeProviderAccount(settings, {
                    accountId: null,
                    runtime: accountRuntime.runtime,
                    wslDistro: accountRuntime.wslDistro
                  })
                )
              }
              disabled={claudeAction !== 'idle' || accountRuntimeUnavailable}
              className={cn(
                'h-auto whitespace-normal font-normal focus-visible:border-border focus-visible:bg-accent/8',
                'flex w-full justify-between gap-3 px-3 py-2.5 text-left transition-colors',
                systemClaudeActive
                  ? 'border-foreground/20 bg-accent/15'
                  : 'border-border/70 hover:border-border hover:bg-accent/8',
                'disabled:cursor-default disabled:opacity-100'
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {translate(
                      'auto.components.settings.AccountsPane.f2a265f8c7',
                      'System default'
                    )}
                  </span>
                  {systemClaudeActive ? (
                    <Badge
                      variant="outline"
                      className="text-foreground/80 h-4 shrink-0 rounded px-1.5 text-[10px] leading-none font-medium"
                    >
                      {translate('auto.components.settings.AccountsPane.e74831fb6b', 'Active')}
                    </Badge>
                  ) : null}
                </div>
                <span className="text-muted-foreground truncate text-[11px]">
                  {translate(
                    'auto.components.settings.AccountsPane.e05d0ff737',
                    'Use your current {{value0}} Claude login.',
                    { value0: accountRuntimeSentenceLabel }
                  )}
                </span>
              </div>
            </Button>
            {visibleClaudeAccounts.length === 0 ? (
              <div className="border-border/70 text-muted-foreground rounded-md border border-dashed px-3 py-4 text-xs">
                {isRemoteAccountScope
                  ? translate(
                      'auto.components.settings.AccountsPane.remoteEmptyClaudeAccounts',
                      'No managed Claude accounts on {{value0}}. It uses its system default Claude login; add accounts on that server.',
                      { value0: accountRuntimeSentenceLabel }
                    )
                  : translate(
                      'auto.components.settings.AccountsPane.3fe7862418',
                      "No managed Claude accounts for {{value0}}. AgentStart will use that environment's system default Claude login until you add one here.",
                      { value0: accountRuntimeSentenceLabel }
                    )}
              </div>
            ) : (
              visibleClaudeAccounts.map((account) => {
                const isActive = providerAccountIsActiveInView(
                  account,
                  claudeAccounts,
                  accountRuntime,
                  accountVisibilityOptions
                )
                const isReauthing = claudeAction === `reauth:${account.id}`
                const isBusy = claudeAction !== 'idle' || accountRuntimeUnavailable

                return (
                  <div
                    key={account.id}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                      isActive
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
                          const accountRuntimeView = getProviderAccountRuntime(account)
                          void runClaudeAccountAction(
                            `select:${account.id}`,
                            () =>
                              selectClaudeProviderAccount(settings, {
                                accountId: account.id,
                                ...accountRuntimeView
                              }),
                            accountRuntimeView
                          )
                        }}
                        disabled={isBusy}
                        className="focus-visible:bg-accent flex h-auto min-w-0 flex-1 flex-col justify-start gap-0.5 border-0 p-0 text-left font-normal whitespace-normal disabled:cursor-default"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{account.email}</span>
                          <Badge
                            variant="outline"
                            className="text-foreground/70 h-4 shrink-0 rounded px-1.5 text-[10px] leading-none font-medium"
                          >
                            {getClaudeAccountRuntimeLabel(account, accountRuntime.label)}
                          </Badge>
                          {isActive ? (
                            <Badge
                              variant="outline"
                              className="text-foreground/80 h-4 shrink-0 rounded px-1.5 text-[10px] leading-none font-medium"
                            >
                              {translate(
                                'auto.components.settings.AccountsPane.e74831fb6b',
                                'Active'
                              )}
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-muted-foreground truncate text-[11px]">
                          {account.organizationName
                            ? `${account.organizationName} · ${formatAccountTimestamp(account.lastAuthenticatedAt)}`
                            : formatAccountTimestamp(account.lastAuthenticatedAt)}
                        </span>
                      </Button>
                      <div className="flex shrink-0 items-center justify-end gap-1 max-md:w-full max-md:flex-wrap">
                        <Button
                          variant="quiet"
                          size="xs"
                          onClick={(event) => {
                            event.stopPropagation()
                            void runClaudeAccountAction(
                              `reauth:${account.id}`,
                              () =>
                                shellClient.accounts.claude.reauthenticate({
                                  accountId: account.id
                                }),
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
                          {translate(
                            'auto.components.settings.AccountsPane.8a0f870153',
                            'Re-authenticate'
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={(event) => {
                            event.stopPropagation()
                            setRemoveClaudeTarget({
                              id: account.id,
                              runtime: getProviderAccountRuntime(account)
                            })
                          }}
                          disabled={isBusy}
                          className="text-muted-foreground hover:text-destructive h-6 px-2"
                        >
                          <Trash2 className="size-3" />
                          {translate('auto.components.settings.AccountsPane.db209ee572', 'Remove')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </SearchableSetting>
      </section>
    </>
  )
}

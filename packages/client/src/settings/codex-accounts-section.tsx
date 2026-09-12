import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type {
  CodexRateLimitAccountsState,
  CodexSystemDefaultIdentity
} from '@agentstart/protocol/settings/managed-accounts'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle, Plus } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import {
  removeCodexProviderAccount,
  selectCodexProviderAccount
} from '~renderer/runtime/provider-accounts-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { OpenAIIcon } from '~renderer/status-bar/icons'
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
import { getCodexSystemDefaultSubtitle } from './account-runtime'
import { getAccountsCodexSearchEntries } from './accounts-search'
import { CodexAccountRow } from './codex-account-row'
import type { ProviderAccountRuntimeView } from './provider-account-visibility'
import { SearchableSetting } from './searchable-setting'
import type { ProviderAccountAction } from './use-provider-accounts'

type CodexAccountsSectionProps = {
  accountRuntime: AccountRuntime
  accountRuntimeSentenceLabel: string
  accountRuntimeUnavailable: boolean
  accountVisibilityOptions: {
    remoteOwner: boolean
    ownerPlatform: NodeJS.Platform | null
  }
  activeCodexAccountId: string | null
  codexAccounts: CodexRateLimitAccountsState
  codexAction: ProviderAccountAction
  hasActiveCodexAuthWarning: boolean
  isRemoteAccountScope: boolean
  runCodexAccountAction: (
    action: ProviderAccountAction,
    operation: () => Promise<CodexRateLimitAccountsState>,
    actionRuntime?: ProviderAccountRuntimeView
  ) => Promise<void>
  settings: GlobalSettings
  systemCodexActive: boolean
  systemCodexIdentity: CodexSystemDefaultIdentity | undefined
  systemCodexNeedsReauthentication: boolean
  visibleCodexAccounts: CodexRateLimitAccountsState['accounts']
  wslCapabilitiesLoading: boolean
}

export function CodexAccountsSection({
  accountRuntime,
  accountRuntimeSentenceLabel,
  accountRuntimeUnavailable,
  accountVisibilityOptions,
  activeCodexAccountId,
  codexAccounts,
  codexAction,
  hasActiveCodexAuthWarning,
  isRemoteAccountScope,
  runCodexAccountAction,
  settings,
  systemCodexActive,
  systemCodexIdentity,
  systemCodexNeedsReauthentication,
  visibleCodexAccounts,
  wslCapabilitiesLoading
}: CodexAccountsSectionProps): React.JSX.Element {
  const [removeCodexTarget, setRemoveCodexTarget] = useState<{
    id: string
    runtime: ProviderAccountRuntimeView
  } | null>(null)
  const activeCodexAuthWarning = hasActiveCodexAuthWarning

  return (
    <>
      <Dialog
        open={removeCodexTarget !== null}
        onOpenChange={(open) => !open && setRemoveCodexTarget(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {translate(
                'auto.components.settings.AccountsPane.0d47394635',
                'Remove Codex Account?'
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.settings.AccountsPane.99c8f9e498',
                'AgentStart will delete the managed Codex home for this saved account. If it is currently active, AgentStart falls back to the system default Codex login.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveCodexTarget(null)}>
              {translate('auto.components.settings.AccountsPane.dbb9626ed1', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = removeCodexTarget
                if (!target) {
                  return
                }
                setRemoveCodexTarget(null)
                void runCodexAccountAction(
                  `remove:${target.id}`,
                  () => removeCodexProviderAccount(settings, target.id),
                  target.runtime
                )
              }}
            >
              {translate('auto.components.settings.AccountsPane.c2d2751587', 'Remove Account')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <section id="accounts-codex" className="scroll-mt-6 space-y-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <OpenAIIcon size={16} />
            {translate('auto.components.settings.AccountsPane.ef91cfa06b', 'Codex')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.AccountsPane.cedfab35ab',
              'Optional. AgentStart can use your normal Codex login; add accounts only if you want quick switching in AgentStart.'
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {isRemoteAccountScope
              ? translate(
                  'auto.components.settings.AccountsPane.remoteScopeAuthContext',
                  'Each account keeps its own sign-in context on {{value0}}.',
                  { value0: accountRuntimeSentenceLabel }
                )
              : translate(
                  'auto.components.settings.AccountsPane.340d6f7a85',
                  'Each account keeps its own local sign-in context in AgentStart. Account auth stays on this device.'
                )}
          </p>
        </div>

        <SearchableSetting
          title={translate('auto.components.settings.AccountsPane.3180536c7a', 'Codex Accounts')}
          description={translate(
            'auto.components.settings.AccountsPane.d0d53b7eb0',
            'Manage which Codex account AgentStart uses for live rate limit fetching.'
          )}
          // Why: this single SearchableSetting backs the whole Codex section,
          // including the "Active Codex Account" sub-control (account picker
          // below). Roll every Codex search entry's title/description/keywords
          // into one haystack so a search for "Active Codex Account" doesn't
          // render the section header with no body underneath it.
          keywords={getAccountsCodexSearchEntries().flatMap((entry) => [
            entry.title,
            entry.description ?? '',
            ...(entry.keywords ?? [])
          ])}
          className="space-y-3 py-2"
        >
          {/* Why: Settings deep-links can target this subsection directly from
        the status-bar account switcher. Keeping a stable DOM anchor here
        avoids dumping the user at the top of Accounts and making them hunt
        for the actual Codex account controls. */}
          {activeCodexAuthWarning ? (
            <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {activeCodexAccountId
                  ? translate(
                      'auto.components.settings.AccountsPane.75ca9b718e',
                      'Codex reported that the active account needs a fresh sign-in. Re-authenticate it before starting new Codex sessions.'
                    )
                  : translate(
                      'auto.components.settings.AccountsPane.e4a28e8894',
                      'Codex reported that the {{value0}} login needs a fresh sign-in. Sign in again before starting new Codex sessions.',
                      { value0: accountRuntimeSentenceLabel }
                    )}
              </span>
            </div>
          ) : null}
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
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                void runCodexAccountAction('adding', () =>
                  shellClient.accounts.codex.add({
                    runtime: accountRuntime.runtime,
                    wslDistro: accountRuntime.wslDistro
                  })
                )
              }
              disabled={
                // Why: interactive `codex login` needs a desktop browser and
                // would authenticate against this device, not the server.
                isRemoteAccountScope ||
                codexAction !== 'idle' ||
                wslCapabilitiesLoading ||
                accountRuntimeUnavailable
              }
              className="gap-1.5"
            >
              {codexAction === 'adding' ? (
                <LoadingIndicator className="size-3" />
              ) : (
                <Plus className="size-3" />
              )}
              {translate('auto.components.settings.AccountsPane.b0e948a4f9', 'Add Account')}
            </Button>
          </div>

          <div className="space-y-2">
            <Button
              variant="destructive"
              size="default"
              type="button"
              onClick={() =>
                void runCodexAccountAction('select:system', () =>
                  selectCodexProviderAccount(settings, {
                    accountId: null,
                    runtime: accountRuntime.runtime,
                    wslDistro: accountRuntime.wslDistro
                  })
                )
              }
              disabled={codexAction !== 'idle' || accountRuntimeUnavailable}
              className={cn(
                'h-auto whitespace-normal font-normal focus-visible:border-border focus-visible:bg-accent/8',
                'flex w-full justify-between gap-3 border px-3 py-2.5 text-left transition-colors',
                systemCodexNeedsReauthentication
                  ? 'border-destructive/50 bg-destructive/5'
                  : systemCodexActive
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
                  {systemCodexActive ? (
                    <Badge
                      variant="outline"
                      className="text-foreground/80 h-4 shrink-0 px-1.5 text-[10px] leading-none font-medium"
                    >
                      {translate('auto.components.settings.AccountsPane.e74831fb6b', 'Active')}
                    </Badge>
                  ) : null}
                  {systemCodexNeedsReauthentication ? (
                    <Badge
                      variant="destructive"
                      className="h-4 shrink-0 px-1.5 text-[10px] leading-none font-medium"
                    >
                      {translate(
                        'auto.components.settings.AccountsPane.93c47b333a',
                        'Needs sign-in'
                      )}
                    </Badge>
                  ) : null}
                </div>
                <span
                  className={cn(
                    'truncate text-[11px]',
                    systemCodexNeedsReauthentication ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {systemCodexNeedsReauthentication
                    ? translate(
                        'auto.components.settings.AccountsPane.fd62f37c24',
                        'Codex reported this {{value0}} login is out of date.',
                        { value0: accountRuntimeSentenceLabel }
                      )
                    : getCodexSystemDefaultSubtitle(
                        systemCodexIdentity,
                        accountRuntimeSentenceLabel
                      )}
                </span>
              </div>
            </Button>
            {visibleCodexAccounts.length === 0 ? (
              <div className="border-border/70 text-muted-foreground border border-dashed px-3 py-4 text-xs">
                {isRemoteAccountScope
                  ? translate(
                      'auto.components.settings.AccountsPane.remoteEmptyCodexAccounts',
                      'No managed Codex accounts on {{value0}}. It uses its system default Codex login; add accounts on that server.',
                      { value0: accountRuntimeSentenceLabel }
                    )
                  : translate(
                      'auto.components.settings.AccountsPane.b4c9450319',
                      "No managed Codex accounts for {{value0}}. AgentStart will use that environment's system default Codex login until you add one here.",
                      { value0: accountRuntimeSentenceLabel }
                    )}
              </div>
            ) : (
              visibleCodexAccounts.map((account) => (
                <CodexAccountRow
                  key={account.id}
                  account={account}
                  accountRuntime={accountRuntime}
                  accountRuntimeUnavailable={accountRuntimeUnavailable}
                  accountVisibilityOptions={accountVisibilityOptions}
                  activeCodexAccountId={activeCodexAccountId}
                  codexAccounts={codexAccounts}
                  codexAction={codexAction}
                  isRemoteAccountScope={isRemoteAccountScope}
                  onRemove={setRemoveCodexTarget}
                  runCodexAccountAction={runCodexAccountAction}
                  settings={settings}
                />
              ))
            )}
          </div>
        </SearchableSetting>
      </section>
    </>
  )
}

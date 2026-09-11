import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState
} from '@agentstart/protocol/settings/managed-accounts'
import { useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { Plus } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'
import { ClaudeIcon, OpenAIIcon } from '~renderer/status-bar/icons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { getFeatureWallUsageProviderConnection } from '../usage-tracking'

type ConnectAction = 'idle' | 'adding'

function ConnectionPill(props: { connected: boolean; label: string }): JSX.Element {
  const { connected, label } = props
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium',
        connected
          ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[color:var(--success)]'
          : 'border-border bg-background text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          connected ? 'bg-[color:var(--success)]' : 'bg-muted-foreground'
        )}
      />
      {label}
    </span>
  )
}

function ProviderRow(props: {
  icon: ReactNode
  name: string
  description: string
  connected: boolean
  connectionLabel: string
  isAdding: boolean
  onSignIn: () => void
}): JSX.Element {
  const { icon, name, description, connected, connectionLabel, isAdding, onSignIn } = props
  return (
    <div className="border-border bg-muted/20 rounded-lg border">
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="border-border bg-background text-foreground flex size-7 shrink-0 items-center justify-center rounded-md border">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground text-[13px] leading-tight font-semibold">{name}</h3>
            <ConnectionPill connected={connected} label={connectionLabel} />
          </div>
          <p className="text-muted-foreground mt-0.5 truncate text-[11.5px] leading-snug">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected ? null : (
            <Button size="sm" onClick={onSignIn} disabled={isAdding}>
              {isAdding ? <LoadingIndicator className="size-3.5" /> : <Plus className="size-3.5" />}
              {isAdding
                ? translate(
                    'auto.components.feature.wall.agents.orchestration.UsageAccountsCard.945865332e',
                    'Signing in'
                  )
                : translate(
                    'auto.components.feature.wall.agents.orchestration.UsageAccountsCard.29d0653961',
                    'Sign in'
                  )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function UsageAccountsCard(props: {
  onAccountStateChange?: () => void | Promise<void>
}): JSX.Element {
  const { onAccountStateChange } = props
  const fetchSettings = useAppStore((s) => s.fetchSettings)
  const rateLimits = useAppStore((s) => s.rateLimits)
  const fetchRateLimits = useAppStore((s) => s.fetchRateLimits)
  const mountedRef = useMountedRef()

  const [claudeAccounts, setClaudeAccounts] = useState<ClaudeRateLimitAccountsState>({
    accounts: [],
    activeAccountId: null
  })
  const [codexAccounts, setCodexAccounts] = useState<CodexRateLimitAccountsState>({
    accounts: [],
    activeAccountId: null
  })
  const [claudeAction, setClaudeAction] = useState<ConnectAction>('idle')
  const [codexAction, setCodexAction] = useState<ConnectAction>('idle')

  // Why: load both account lists once on mount. AccountsPane re-fetches on
  // every settings open; here the feature wall is short-lived so a single
  // fetch is enough — sign-in flows refresh state inline below.
  useEffect(() => {
    let stale = false
    void fetchRateLimits()
    void (async () => {
      try {
        const next = await shellClient.accounts.claude.list()
        if (!stale) {
          setClaudeAccounts(next)
        }
      } catch {
        // Silent — empty list is the right fallback for the inline pitch.
      }
    })()
    void (async () => {
      try {
        const next = await shellClient.accounts.codex.list()
        if (!stale) {
          setCodexAccounts(next)
        }
      } catch {
        // Silent — same reason as above.
      }
    })()
    return () => {
      stale = true
    }
  }, [fetchRateLimits])

  const claudeConnection = getFeatureWallUsageProviderConnection({
    managedAccountCount: claudeAccounts.accounts.length,
    provider: rateLimits.claude
  })
  const codexConnection = getFeatureWallUsageProviderConnection({
    managedAccountCount: codexAccounts.accounts.length,
    provider: rateLimits.codex
  })

  const handleClaudeSignIn = async (): Promise<void> => {
    if (claudeAction !== 'idle') {
      return
    }
    setClaudeAction('adding')
    try {
      const next = await shellClient.accounts.claude.add()
      if (mountedRef.current) {
        setClaudeAccounts(next)
      }
      await fetchSettings()
      if (mountedRef.current) {
        await onAccountStateChange?.()
        if (mountedRef.current) {
          toast.success(
            translate(
              'auto.components.feature.wall.agents.orchestration.UsageAccountsCard.9ddeb558f9',
              'Claude account added.'
            )
          )
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.feature.wall.agents.orchestration.UsageAccountsCard.4e71d72912',
            'Claude sign-in failed.'
          ),
          {
            description: String((error as Error)?.message ?? error)
          }
        )
      }
    } finally {
      if (mountedRef.current) {
        setClaudeAction('idle')
      }
    }
  }

  const handleCodexSignIn = async (): Promise<void> => {
    if (codexAction !== 'idle') {
      return
    }
    setCodexAction('adding')
    try {
      const next = await shellClient.accounts.codex.add()
      if (mountedRef.current) {
        setCodexAccounts(next)
      }
      await fetchSettings()
      if (mountedRef.current) {
        await onAccountStateChange?.()
        if (mountedRef.current) {
          toast.success(
            translate(
              'auto.components.feature.wall.agents.orchestration.UsageAccountsCard.c7b90c140b',
              'Codex account added.'
            )
          )
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.feature.wall.agents.orchestration.UsageAccountsCard.8919321417',
            'Codex sign-in failed.'
          ),
          {
            description: String((error as Error)?.message ?? error)
          }
        )
      }
    } finally {
      if (mountedRef.current) {
        setCodexAction('idle')
      }
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <ProviderRow
        icon={<ClaudeIcon size={16} />}
        name="Claude"
        description={translate(
          'auto.components.feature.wall.agents.orchestration.UsageAccountsCard.d90d2e1f6d',
          'Track session and weekly usage.'
        )}
        connected={claudeConnection.connected}
        connectionLabel={claudeConnection.label}
        isAdding={claudeAction === 'adding'}
        onSignIn={() => void handleClaudeSignIn()}
      />
      <ProviderRow
        icon={<OpenAIIcon size={16} />}
        name="Codex"
        description={translate(
          'auto.components.feature.wall.agents.orchestration.UsageAccountsCard.6986b36708',
          'Surface rate limits and swap accounts inline.'
        )}
        connected={codexConnection.connected}
        connectionLabel={codexConnection.label}
        isAdding={codexAction === 'adding'}
        onSignIn={() => void handleCodexSignIn()}
      />
    </div>
  )
}

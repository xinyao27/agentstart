import type { GitHubRateLimitSnapshot } from '@agentstart/protocol/hosted-review/query-types'
import React, { useEffect, useRef, useState } from 'react'
import { installWindowVisibilityInterval } from '~renderer/application-shell/window-visibility-interval'
import { translate } from '~renderer/i18n/i18n'
import { Gauge, ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { getProviderRateLimitScope } from '~renderer/settings/provider-account-scope'
import { ProviderHostScopeControl } from '~renderer/settings/provider-host-scope-control'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

const REFRESH_INTERVAL_MS = 60_000

type BucketKey = 'core' | 'search' | 'graphql'

type BucketMeta = {
  key: BucketKey
  label: string
  description: string
}

const BUCKETS: BucketMeta[] = [
  {
    key: 'core',
    get label() {
      return translate('auto.components.github.github.rate.limit.display.bb227706a6', 'REST')
    },
    get description() {
      return translate('auto.components.github.github.rate.limit.display.c392c749a6', 'REST API')
    }
  },
  {
    key: 'search',
    get label() {
      return translate('auto.components.github.github.rate.limit.display.c377a4f06a', 'Search')
    },
    get description() {
      return translate('auto.components.github.github.rate.limit.display.1f2f28a4de', 'Search API')
    }
  },
  {
    key: 'graphql',
    get label() {
      return translate('auto.components.github.github.rate.limit.display.1daf0f22a9', 'GraphQL')
    },
    get description() {
      return translate('auto.components.github.github.rate.limit.display.01f7323e58', 'GraphQL API')
    }
  }
]

function formatGitHubRateLimitReset(resetAt: number): string {
  const deltaSec = Math.max(0, resetAt - Math.floor(Date.now() / 1000))
  if (deltaSec < 60) {
    return `${deltaSec}s`
  }
  const mins = Math.round(deltaSec / 60)
  return `${mins}m`
}

function toneForGitHubBucket(remaining: number, limit: number): 'ok' | 'warn' | 'crit' {
  if (limit <= 0) {
    return 'ok'
  }
  const pct = remaining / limit
  if (pct < 0.1) {
    return 'crit'
  }
  if (pct < 0.25) {
    return 'warn'
  }
  return 'ok'
}

function useGitHubRateLimitSnapshot(options?: { autoRefresh?: boolean }): {
  snapshot: GitHubRateLimitSnapshot | null
  hasError: boolean
  isFetching: boolean
  refresh: (force?: boolean) => Promise<void>
} {
  const [snapshot, setSnapshot] = useState<GitHubRateLimitSnapshot | null>(null)
  const [hasError, setHasError] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const settings = useAppStore((s) => s.settings)
  const latestToken = useRef(0)
  const autoRefresh = options?.autoRefresh ?? true

  const refresh = useEventCallback(async (force = false): Promise<void> => {
    const token = ++latestToken.current
    setIsFetching(true)
    try {
      const target = getActiveRuntimeTarget(settings)
      const client = await openGitHubTarget()
      if (!client) {
        throw new Error('GitHub protocol capability is unavailable')
      }
      const res = await client.getRateLimit(force, {
        timeoutMs: 30_000,
        ...runtimeCallDestination(target)
      })
      if (token !== latestToken.current) {
        return
      }
      if (res?.ok) {
        setSnapshot(res.snapshot)
        setHasError(false)
      } else {
        setHasError(true)
      }
    } catch {
      if (token === latestToken.current) {
        setHasError(true)
      }
    } finally {
      if (token === latestToken.current) {
        setIsFetching(false)
      }
    }
  })

  useEffect(() => {
    if (!autoRefresh) {
      return
    }
    return installWindowVisibilityInterval({
      run: () => void refresh(false),
      intervalMs: REFRESH_INTERVAL_MS
    })
  }, [autoRefresh, refresh])

  return { snapshot, hasError, isFetching, refresh }
}

function GitHubRateLimitRows({
  snapshot
}: {
  snapshot: GitHubRateLimitSnapshot
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {BUCKETS.map((b) => {
        const v = snapshot[b.key]
        const tone = toneForGitHubBucket(v.remaining, v.limit)
        return (
          <div key={b.key} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{b.description}</span>
            <span
              className={cn(
                'tabular-nums text-foreground',
                tone === 'crit' && 'text-red-600 dark:text-red-300',
                tone === 'warn' && 'text-amber-700 dark:text-amber-300'
              )}
            >
              {v.remaining}{' '}
              {translate('auto.components.github.github.rate.limit.display.f42790d150', 'of')}
              {v.limit}{' '}
              {translate(
                'auto.components.github.github.rate.limit.display.6da1858354',
                'left · resets in'
              )}
              {formatGitHubRateLimitReset(v.resetAt)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function GitHubRateLimitPanel({ className }: { className?: string }): React.JSX.Element {
  const { snapshot, hasError, isFetching, refresh } = useGitHubRateLimitSnapshot()
  const settings = useAppStore((s) => s.settings)
  const budgetScope = getProviderRateLimitScope(settings, 'GitHub')

  return (
    <div className={cn('space-y-3 rounded-md border border-border/60 p-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-foreground flex items-center gap-1.5 text-sm font-medium">
            <Gauge className="size-4" />
            {translate(
              'auto.components.github.github.rate.limit.display.58c5f88216',
              'GitHub API Budget'
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.github.github.rate.limit.display.d5e5de9070',
              'AgentStart uses REST, Search, and GraphQL through the GitHub CLI.'
            )}
          </p>
          <ProviderHostScopeControl
            labelPrefix={translate(
              'auto.components.github.github.rate.limit.display.budget_scope_prefix',
              'Budget scope'
            )}
            scope={budgetScope}
            className="text-xs"
          />
        </div>
        <Button
          variant="secondary"
          size="icon-xs"
          type="button"
          onClick={() => void refresh(true)}
          disabled={isFetching}
          className="border-border hover:bg-accent focus-visible:bg-accent size-7 border transition"
          aria-label={translate(
            'auto.components.github.github.rate.limit.display.d12d3d6f33',
            'Refresh GitHub API budget'
          )}
        >
          {isFetching ? (
            <LoadingIndicator className="size-3.5" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>
      {hasError ? (
        <div className="text-muted-foreground text-xs">
          {translate(
            'auto.components.github.github.rate.limit.display.34973d4695',
            'GitHub API budget is unavailable.'
          )}
        </div>
      ) : snapshot ? (
        <GitHubRateLimitRows snapshot={snapshot} />
      ) : (
        <div className="text-muted-foreground text-xs">
          {translate(
            'auto.components.github.github.rate.limit.display.5509443543',
            'Loading GitHub API budget…'
          )}
        </div>
      )}
    </div>
  )
}

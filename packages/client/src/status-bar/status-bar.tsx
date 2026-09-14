import type { ProviderRateLimits } from '@agentstart/protocol/account-rate-types'
import type { StatusBarItem } from '@agentstart/protocol/settings/ui-state'
import { normalizeStatusBarUsageMode } from '@agentstart/protocol/settings/usage-display'
import { normalizeUsagePercentageDisplay } from '@agentstart/protocol/settings/usage-display'
import { Suspense, useEffect, useState } from 'react'

import { translate } from '../i18n/i18n'
import { ActivityIcon, Plug } from '../icons/hugeicons'
import { USAGE_PERCENTAGE_DISPLAY_SETTING_ID } from '../settings/appearance/usage-percentage-search'
import { useAppStore } from '../store/state'
import { Button } from '../ui/button'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuTrigger
} from '../ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { getExecutionHostIdForWorktree } from '../worktree/runtime-owner'
import { PortsStatusSegment } from './ports-status-segment'
import { ProviderUsageSegment } from './provider-usage-segment'
import { getVisibleUsageProvider } from './provider-visibility'
import { RemoteServerUpdateStatusSegment } from './remote-server-update-status-segment'
import { ResourceUsageStatusSegment } from './resource-usage-status-segment'
import { AgentStartRuntimeStatusSegment } from './runtime-status/segment'
import { SkillUpdateStatusSegment } from './skill-update-status-segment'
import { getUsageProviderAccountsSectionId } from './usage-provider-settings-target'
import { UsageRosterPanel } from './usage-roster-panel'

type ProviderId = ProviderRateLimits['provider']

const PROVIDER_ITEMS: readonly {
  id: Exclude<StatusBarItem, 'ports' | 'resource-usage'>
  label: string
}[] = [
  { id: 'claude', label: 'Claude Usage' },
  { id: 'codex', label: 'Codex Usage' },
  { id: 'cursor', label: 'Cursor Usage' },
  { id: 'gemini', label: 'Gemini Usage' },
  { id: 'antigravity', label: 'Antigravity Usage' },
  { id: 'opencode-go', label: 'OpenCode Go Usage' },
  { id: 'kimi', label: 'Kimi Usage' },
  { id: 'minimax', label: 'MiniMax Usage' },
  { id: 'grok', label: 'Grok Usage' }
]

const USAGE_FETCH_RETRY_DELAY_MS = 5_000
const USAGE_FETCH_RETRY_LIMIT = 5

function visibleProviders(
  rateLimits: ReturnType<typeof useAppStore.getState>['rateLimits'],
  settings: ReturnType<typeof useAppStore.getState>['settings'],
  enabled: readonly StatusBarItem[]
): ProviderRateLimits[] {
  const visibilitySettings = {
    ...settings,
    antigravityUsageConfigured: enabled.includes('antigravity'),
    grokAuthConfigured: rateLimits.grokAuthConfigured,
    minimaxCookieConfigured: rateLimits.minimaxCookieConfigured
  }
  const byId: Record<ProviderId, ProviderRateLimits | null | undefined> = {
    antigravity: rateLimits.antigravity,
    claude: rateLimits.claude,
    codex: rateLimits.codex,
    cursor: rateLimits.cursor,
    gemini: rateLimits.gemini,
    grok: rateLimits.grok,
    kimi: rateLimits.kimi,
    minimax: rateLimits.minimax,
    'opencode-go': rateLimits.opencodeGo
  }
  return PROVIDER_ITEMS.flatMap(({ id }) => {
    if (!enabled.includes(id)) {
      return []
    }
    const provider = getVisibleUsageProvider(id, byId[id] ?? null, visibilitySettings)
    return provider ? [provider] : []
  })
}

function StatusBarSettings({
  items,
  onToggle
}: {
  items: readonly StatusBarItem[]
  onToggle: (item: StatusBarItem) => void
}): React.JSX.Element {
  return (
    <ContextMenuContent className="w-56">
      {PROVIDER_ITEMS.map((item) => (
        <ContextMenuCheckboxItem
          checked={items.includes(item.id)}
          key={item.id}
          onCheckedChange={() => onToggle(item.id)}
        >
          {translate(`statusBar.provider.${item.id}`, item.label)}
        </ContextMenuCheckboxItem>
      ))}
      <ContextMenuCheckboxItem
        checked={items.includes('resource-usage')}
        onCheckedChange={() => onToggle('resource-usage')}
      >
        <ActivityIcon className="size-3.5" />
        {translate('statusBar.resourceManager', 'Resource Manager')}
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        checked={items.includes('ports')}
        onCheckedChange={() => onToggle('ports')}
      >
        <Plug className="size-3.5" />
        {translate('statusBar.ports', 'Ports')}
      </ContextMenuCheckboxItem>
    </ContextMenuContent>
  )
}

export function StatusBar(): React.JSX.Element | null {
  const [usageOpen, setUsageOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const rateLimits = useAppStore((state) => state.rateLimits)
  const settings = useAppStore((state) => state.settings)
  const statusBarVisible = useAppStore((state) => state.statusBarVisible)
  const statusBarItems = useAppStore((state) => state.statusBarItems)
  const toggleStatusBarItem = useAppStore((state) => state.toggleStatusBarItem)
  const refreshRateLimits = useAppStore((state) => state.refreshRateLimits)
  const fetchRateLimits = useAppStore((state) => state.fetchRateLimits)
  const openHomePage = useAppStore((state) => state.openHomePage)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const statusBarUsageMode = normalizeStatusBarUsageMode(
    useAppStore((state) => state.statusBarUsageMode)
  )
  const setStatusBarUsageMode = useAppStore((state) => state.setStatusBarUsageMode)
  const usagePercentageDisplay = normalizeUsagePercentageDisplay(
    useAppStore((state) => state.usagePercentageDisplay)
  )
  const providers = visibleProviders(rateLimits, settings, statusBarItems)
  const usageDataPending =
    PROVIDER_ITEMS.some(({ id }) => statusBarItems.includes(id)) && providers.length === 0
  // Why: the usage button renders only once a provider reports data, and the
  // startup snapshot fetch can lose its race with the daemon connection — a
  // freshly restarted daemon answers subscribe with an empty ready snapshot.
  // Without a retry the button stays hidden and its own open-to-fetch path
  // can never run.
  useEffect(() => {
    if (!usageDataPending) {
      return
    }
    let attempts = 0
    let timer: number | undefined
    const retry = (): void => {
      attempts += 1
      void fetchRateLimits()
      if (attempts < USAGE_FETCH_RETRY_LIMIT) {
        timer = window.setTimeout(retry, USAGE_FETCH_RETRY_DELAY_MS)
      }
    }
    retry()
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer)
      }
    }
  }, [usageDataPending, fetchRateLimits])
  if (!statusBarVisible) {
    // Why: the runtime indicator is connection health, so it stays even when
    // the usage and tool indicators are hidden.
    return (
      <footer
        aria-label={translate(
          'auto.components.status.bar.AgentStartRuntimeStatus.footer',
          'AgentStart Runtime status'
        )}
        className="mt-auto flex min-h-6 shrink-0 flex-wrap items-center justify-end px-2 py-1 text-xs"
      >
        <AgentStartRuntimeStatusSegment />
      </footer>
    )
  }

  const openProvider = (provider: ProviderId): void => {
    const sectionId = getUsageProviderAccountsSectionId(provider)
    setUsageOpen(false)
    openSettingsTarget({
      pane: 'accounts',
      repoId: null,
      ...(sectionId ? { sectionId } : {})
    })
    openSettingsPage()
  }
  const refresh = (): void => {
    if (isRefreshing) {
      return
    }
    setIsRefreshing(true)
    const state = useAppStore.getState()
    const worktreeId = state.activeWorktreeId
    const cursorContext = worktreeId
      ? {
          executionHostId: getExecutionHostIdForWorktree(state, worktreeId),
          workspaceId: worktreeId
        }
      : undefined
    void refreshRateLimits(cursorContext).finally(() => setIsRefreshing(false))
  }

  return (
    <ContextMenu>
      {/* Why: the sidebar footer is only 240–500px wide. Usage owns the left
          column and wraps its own providers and windows instead of being
          clipped, while the indicator cluster holds the right edge on the same
          row — wrapping it below the meters cost the footer a whole line for
          three icons. */}
      <ContextMenuTrigger className="mt-auto grid min-h-6 grid-cols-[minmax(0,1fr)_auto] items-end gap-x-1.5 px-2 py-1 text-xs">
        {providers.length > 0 || usageDataPending ? (
          <DropdownMenu
            modal={false}
            onOpenChange={(open) => {
              setUsageOpen(open)
              if (open && !isRefreshing) {
                setIsRefreshing(true)
                void fetchRateLimits().finally(() => setIsRefreshing(false))
              }
            }}
            open={usageOpen}
          >
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={translate('statusBar.usage', 'Usage')}
                  // Why: `h-full` is cyclic once this control wraps — the footer
                  // sizes to its content, so a percentage height resolves a line
                  // short. `justify-self-start` keeps the trigger's own width so
                  // a short meter row does not paint a hover surface across the
                  // empty half of its grid column.
                  className="h-auto max-w-full flex-wrap justify-start gap-x-3 gap-y-0.5 justify-self-start"
                  size="status-bar"
                  type="button"
                  variant="status-bar"
                >
                  {providers.map((provider) => (
                    <ProviderUsageSegment
                      compact
                      display={usagePercentageDisplay}
                      key={provider.provider}
                      limits={provider}
                      mode={statusBarUsageMode}
                    />
                  ))}
                  {/* Why: keep the trigger visible while no provider has data
                  yet, so the menu (and its refresh) stays reachable instead of
                  the whole meter silently disappearing. */}
                  {providers.length === 0 ? (
                    <span aria-hidden className="text-muted-foreground animate-pulse">
                      ···
                    </span>
                  ) : null}
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-[360px] p-0" side="top">
              <UsageRosterPanel
                canSignIn={(provider) => getUsageProviderAccountsSectionId(provider) !== null}
                display={usagePercentageDisplay}
                isRefreshing={isRefreshing}
                onManageAccounts={() => openProvider('codex')}
                onOpenProvider={openProvider}
                onRefresh={refresh}
                onSignIn={openProvider}
                onStatusBarSettings={() => {
                  setUsageOpen(false)
                  openSettingsTarget({
                    pane: 'appearance',
                    repoId: null,
                    sectionId: USAGE_PERCENTAGE_DISPLAY_SETTING_ID
                  })
                  openSettingsPage()
                }}
                onStatusBarUsageModeChange={setStatusBarUsageMode}
                onUsageDetails={() => {
                  setUsageOpen(false)
                  openHomePage()
                }}
                providers={providers}
                statusBarUsageMode={statusBarUsageMode}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {/* Why: the cluster pins itself to the second column so it keeps the
            right edge even when no provider reports usage and the first column
            is empty. */}
        <div className="col-start-2 flex items-center gap-0.5">
          <SkillUpdateStatusSegment />
          <RemoteServerUpdateStatusSegment iconOnly />
          <Suspense fallback={null}>
            {statusBarItems.includes('resource-usage') ? (
              <ResourceUsageStatusSegment compact iconOnly />
            ) : null}
            {statusBarItems.includes('ports') ? <PortsStatusSegment compact iconOnly /> : null}
          </Suspense>
          <AgentStartRuntimeStatusSegment />
        </div>
      </ContextMenuTrigger>
      <StatusBarSettings items={statusBarItems} onToggle={toggleStatusBarItem} />
    </ContextMenu>
  )
}

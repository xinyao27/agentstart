import type { ProviderRateLimits } from '@agentstart/protocol/account-rate-types'
import type { StatusBarItem } from '@agentstart/protocol/settings/ui-state'
import { normalizeStatusBarUsageMode } from '@agentstart/protocol/settings/usage-display'
import { normalizeUsagePercentageDisplay } from '@agentstart/protocol/settings/usage-display'
import { Suspense, useState } from 'react'

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
  if (!statusBarVisible) {
    return null
  }
  const providers = visibleProviders(rateLimits, settings, statusBarItems)

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
      <ContextMenuTrigger className="border-border bg-background flex h-6 min-h-6 shrink-0 items-center border-t pr-3 text-xs">
        {providers.length > 0 ? (
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
                  className="gap-3"
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
        <div className="flex-1" />
        <div className="flex h-full shrink-0 items-center gap-0.5 rounded-full">
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

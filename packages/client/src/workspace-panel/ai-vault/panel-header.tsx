import type { AiVaultAgent } from '@yiru/protocol/ai-vault/providers'
import type { ExecutionHostScope } from '@yiru/protocol/host/identity'
import { translate } from '~renderer/i18n/i18n'
import {
  MagnifyingGlass as Search,
  ArrowClockwise as RefreshCw,
  X
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'
import type {
  AiVaultGroup,
  AiVaultScope,
  AiVaultSort
} from '~renderer/workspace-panel/ai-vault/session/providers'

import {
  RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME,
  RIGHT_SIDEBAR_INPUT_BUTTON_SURFACE_CLASS_NAME
} from '../right-sidebar-button-styles'
import type { AiVaultHostScopeOption } from './host-scope'
import { VaultHostScopeMenu, VaultScopeSwitch, VaultViewMenu } from './panel-controls'

type AiVaultPanelHeaderProps = {
  query: string
  loading: boolean
  shownCount: number
  sessionCount: number
  hasScanResult: boolean
  activeWorktreePath: string | null
  activeProjectKey: string | null
  scope: AiVaultScope
  executionHostScope: ExecutionHostScope
  hostScopeOptions: readonly AiVaultHostScopeOption[]
  agents: readonly AiVaultAgent[]
  sort: AiVaultSort
  group: AiVaultGroup
  hideEmptySessions: boolean
  adjustmentCount: number
  onQueryChange: (query: string) => void
  onScopeChange: (scope: AiVaultScope) => void
  onExecutionHostScopeChange: (scope: ExecutionHostScope) => void
  onAgentEnabledChange: (agent: AiVaultAgent, enabled: boolean) => void
  onSortChange: (sort: AiVaultSort) => void
  onGroupChange: (group: AiVaultGroup) => void
  onHideEmptySessionsChange: (hideEmptySessions: boolean) => void
  onReset: () => void
  onRefresh: () => void
}

export function AiVaultPanelHeader({
  query,
  loading,
  shownCount,
  sessionCount,
  hasScanResult,
  activeWorktreePath,
  activeProjectKey,
  scope,
  executionHostScope,
  hostScopeOptions,
  agents,
  sort,
  group,
  hideEmptySessions,
  adjustmentCount,
  onQueryChange,
  onScopeChange,
  onExecutionHostScopeChange,
  onAgentEnabledChange,
  onSortChange,
  onGroupChange,
  onHideEmptySessionsChange,
  onReset,
  onRefresh
}: AiVaultPanelHeaderProps): React.JSX.Element {
  return (
    <div className="shrink-0 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-xs font-semibold">
            {/* Why: below 300px the header competes with fixed controls, so compact copy prevents overlap. */}
            <span className="@max-[300px]/ai-vault:hidden">
              {translate(
                'auto.components.right.sidebar.AiVaultPanel.sessionHistory',
                'Agent Session History'
              )}
            </span>
            <span className="hidden @max-[300px]/ai-vault:inline">
              {translate('auto.components.right.sidebar.AiVaultPanel.agents', 'Agents')}
            </span>
          </div>
          <div className="text-muted-foreground truncate text-[11px]">
            {hasScanResult ? (
              <>
                <span className="@max-[300px]/ai-vault:hidden">
                  {translate(
                    'auto.components.right.sidebar.AiVaultPanel.shownRecent',
                    '{{value0}} shown · {{value1}} recent',
                    { value0: shownCount, value1: sessionCount }
                  )}
                </span>
                <span className="hidden @max-[300px]/ai-vault:inline">
                  {translate(
                    'auto.components.right.sidebar.AiVaultPanel.sessionsShownCompact',
                    '{{value0}} shown',
                    { value0: shownCount }
                  )}
                </span>
              </>
            ) : (
              translate(
                'auto.components.right.sidebar.AiVaultPanel.resumePastSessions',
                'Resume past sessions'
              )
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 @max-[300px]/ai-vault:gap-0.5">
          <VaultHostScopeMenu
            executionHostScope={executionHostScope}
            hostOptions={hostScopeOptions}
            onExecutionHostScopeChange={onExecutionHostScopeChange}
          />
          <VaultViewMenu
            agents={agents}
            sort={sort}
            group={group}
            hideEmptySessions={hideEmptySessions}
            adjustmentCount={adjustmentCount}
            onAgentEnabledChange={onAgentEnabledChange}
            onSortChange={onSortChange}
            onGroupChange={onGroupChange}
            onHideEmptySessionsChange={onHideEmptySessionsChange}
            onReset={onReset}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label={translate(
              'auto.components.right.sidebar.AiVaultPanel.refreshSessionHistory',
              'Refresh Session History'
            )}
            onClick={onRefresh}
            disabled={loading}
            aria-busy={loading}
            className={cn(RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME, 'size-6')}
          >
            {loading ? <LoadingIndicator className="size-3" /> : <RefreshCw className="size-3" />}
          </Button>
        </div>
      </div>

      <div className="mt-2">
        <VaultScopeSwitch
          scope={scope}
          workspaceAvailable={Boolean(activeWorktreePath)}
          projectAvailable={Boolean(activeProjectKey)}
          onScopeChange={onScopeChange}
        />
      </div>

      <div className="border-sidebar-border bg-input/50 focus-within:border-sidebar-ring mt-2 flex h-8 items-center gap-1.5 border px-2">
        <Search className="text-muted-foreground size-3.5 shrink-0" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          variant="chrome-free"
          size="xs"
          placeholder={translate(
            'auto.components.right.sidebar.AiVaultPanel.searchSessions',
            'Search sessions'
          )}
          className="flex-1"
          spellCheck={false}
        />
        {loading ? <LoadingIndicator className="text-muted-foreground size-3" /> : null}
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(RIGHT_SIDEBAR_INPUT_BUTTON_SURFACE_CLASS_NAME, 'size-5')}
            onClick={() => onQueryChange('')}
            aria-label={translate(
              'auto.components.right.sidebar.AiVaultPanel.clearSearch',
              'Clear search'
            )}
          >
            <X className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

import { AI_VAULT_AGENTS, type AiVaultAgent } from '@yiru/protocol/ai-vault/providers'
import type { ExecutionHostScope } from '@yiru/protocol/host/identity'
import type React from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { getExecutionHostLabel } from '~renderer/execution-host/labels'
import { translate } from '~renderer/i18n/i18n'
import {
  Archive as ArchiveRestore,
  Calendar,
  Clock as Clock3,
  FolderOpen,
  Funnel as ListFilter,
  Layout as PanelsTopLeft,
  HardDrives as Server,
  CaretRight as ChevronRight
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '~renderer/ui/toggle-group'
import type {
  AiVaultGroup,
  AiVaultScope,
  AiVaultSort
} from '~renderer/workspace-panel/ai-vault/session/providers'

import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from '../right-sidebar-button-styles'
import type { AiVaultHostScopeOption } from './host-scope'
import { agentLabel, type AiVaultSessionGroup } from './session/filter'

const VAULT_HEADER_CONTROL_CLASS = 'size-6 shrink-0'

// Why: match ToggleGroup's spacing+outline qualifiers so selected edges out-specify its border-l-0 collapse.
const VAULT_SCOPE_SELECTED_EDGE_CLASS =
  'data-[spacing=0]:data-[variant=outline]:aria-[checked=true]:border-l data-[spacing=0]:data-[variant=outline]:data-[state=on]:border-l'

// Why: the group owns the 28px outer border, so items must fit its 26px content box
// instead of painting over the horizontal edges.
const VAULT_SCOPE_TOGGLE_ITEM_CLASS = cn(
  'h-full min-h-0 min-w-0 flex-1 basis-0 shrink border border-transparent bg-sidebar px-2.5 text-[11px] font-medium leading-none text-foreground hover:bg-accent hover:text-accent-foreground aria-[checked=true]:border-foreground/20 aria-[checked=true]:bg-accent aria-[checked=true]:text-accent-foreground aria-[checked=true]:hover:bg-accent data-[state=on]:border-foreground/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground data-[state=on]:hover:bg-accent',
  VAULT_SCOPE_SELECTED_EDGE_CLASS,
  '@max-[300px]/ai-vault:px-1.5'
)

export function VaultGroupHeader({
  group,
  collapsed,
  onToggle
}: {
  group: AiVaultSessionGroup
  collapsed: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      className="border-sidebar-border bg-sidebar-accent/60 focus-visible:bg-accent flex w-full justify-start gap-2 border-y text-left text-xs font-semibold whitespace-normal transition-colors"
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <ChevronRight
        className={cn(
          'size-3.5 shrink-0 text-foreground/80 transition-transform',
          !collapsed && 'rotate-90'
        )}
      />
      <span className="min-w-0 flex-1 truncate">{group.label}</span>
      <span className="border-sidebar-border bg-background text-foreground border px-2 py-0.5 text-[11px] leading-none font-semibold tabular-nums">
        {group.sessions.length}
      </span>
    </Button>
  )
}

export function SessionLoadingState(): React.JSX.Element {
  return (
    <div className="px-3 py-3" aria-busy="true">
      <div className="text-muted-foreground mb-3 flex items-center gap-2 text-[11px]">
        <LoadingIndicator className="size-3.5 shrink-0" />
        <span>
          {translate(
            'auto.components.right.sidebar.AiVaultPanelControls.scanningSessions',
            'Scanning sessions'
          )}
        </span>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="bg-sidebar-accent mt-1 size-4" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="bg-sidebar-accent h-3 w-4/5" />
              <div className="bg-sidebar-accent/75 h-2.5 w-3/5" />
              <div className="bg-sidebar-accent/60 h-2.5 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function VaultScopeSwitch({
  scope,
  workspaceAvailable,
  projectAvailable,
  onScopeChange
}: {
  scope: AiVaultScope
  workspaceAvailable: boolean
  projectAvailable: boolean
  onScopeChange: (scope: AiVaultScope) => void
}): React.JSX.Element {
  const workspaceLabel = translate(
    'auto.components.right.sidebar.AiVaultPanelControls.workspaceScope',
    'Workspace'
  )
  const projectLabel = translate(
    'auto.components.right.sidebar.AiVaultPanelControls.projectScope',
    'Project'
  )
  const allLabel = translate('auto.components.right.sidebar.AiVaultPanelControls.allScope', 'All')

  return (
    <ToggleGroup
      value={[scope]}
      onValueChange={(value) => {
        const next = value[0]
        if (next === 'workspace' || next === 'project' || next === 'all') {
          onScopeChange(next)
        }
      }}
      variant="outline"
      className="border-sidebar-border bg-sidebar h-7 w-full border-x border-t"
      aria-label={translate(
        'auto.components.right.sidebar.AiVaultPanelControls.scopeAriaLabel',
        'Session History scope: {{value0}}',
        {
          value0:
            scope === 'workspace'
              ? translate(
                  'auto.components.right.sidebar.AiVaultPanelControls.currentWorkspaceLower',
                  'current workspace'
                )
              : scope === 'project'
                ? translate(
                    'auto.components.right.sidebar.AiVaultPanelControls.currentProjectLower',
                    'current project'
                  )
                : translate(
                    'auto.components.right.sidebar.AiVaultPanelControls.allSessionsLower',
                    'all sessions'
                  )
        }
      )}
    >
      <ToggleGroupItem
        value="workspace"
        disabled={!workspaceAvailable}
        className={VAULT_SCOPE_TOGGLE_ITEM_CLASS}
      >
        {workspaceLabel}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="project"
        disabled={!projectAvailable}
        className={VAULT_SCOPE_TOGGLE_ITEM_CLASS}
      >
        {projectLabel}
      </ToggleGroupItem>
      <ToggleGroupItem value="all" className={VAULT_SCOPE_TOGGLE_ITEM_CLASS}>
        {allLabel}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export function VaultHostScopeMenu({
  executionHostScope,
  hostOptions,
  onExecutionHostScopeChange
}: {
  executionHostScope: ExecutionHostScope
  hostOptions: readonly AiVaultHostScopeOption[]
  onExecutionHostScopeChange: (scope: ExecutionHostScope) => void
}): React.JSX.Element {
  const selectedOption = hostOptions.find((option) => option.id === executionHostScope)
  const label = selectedOption?.label ?? getExecutionHostLabel(executionHostScope)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME,
              'h-6 max-w-24 gap-1 px-1.5 text-[11px] @max-[340px]/ai-vault:w-6 @max-[340px]/ai-vault:px-0'
            )}
            aria-label={translate(
              'auto.components.right.sidebar.AiVaultPanelControls.hostScopeAriaLabel',
              'Session History host: {{value0}}',
              { value0: label }
            )}
          >
            <Server className="size-3 shrink-0" />
            <span className="min-w-0 truncate @max-[340px]/ai-vault:hidden">{label}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        <DropdownMenuLabel>
          {translate('auto.components.right.sidebar.AiVaultPanelControls.host', 'Host')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={executionHostScope}
          onValueChange={(value) => onExecutionHostScopeChange(value as ExecutionHostScope)}
        >
          {hostOptions.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function VaultViewMenu({
  agents,
  sort,
  group,
  hideEmptySessions,
  adjustmentCount,
  onAgentEnabledChange,
  onSortChange,
  onGroupChange,
  onHideEmptySessionsChange,
  onReset
}: {
  agents: readonly AiVaultAgent[]
  sort: AiVaultSort
  group: AiVaultGroup
  hideEmptySessions: boolean
  adjustmentCount: number
  onAgentEnabledChange: (agent: AiVaultAgent, enabled: boolean) => void
  onSortChange: (sort: AiVaultSort) => void
  onGroupChange: (group: AiVaultGroup) => void
  onHideEmptySessionsChange: (hideEmptySessions: boolean) => void
  onReset: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className={cn(
              RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME,
              VAULT_HEADER_CONTROL_CLASS,
              'relative'
            )}
            aria-label={translate(
              'auto.components.right.sidebar.AiVaultPanelControls.viewOptionsAriaLabel',
              'Session History view options'
            )}
          >
            <ListFilter className="size-3" />
            <span className="sr-only">
              {translate(
                'auto.components.right.sidebar.AiVaultPanelControls.viewOptions',
                'View options'
              )}
            </span>
            {adjustmentCount > 0 ? (
              <span
                aria-hidden
                className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center px-1 text-[9px] leading-none font-medium"
              >
                {adjustmentCount}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        <DropdownMenuLabel>
          {translate('auto.components.right.sidebar.AiVaultPanelControls.agents', 'Agents')}
        </DropdownMenuLabel>
        {AI_VAULT_AGENTS.map((agent) => (
          <DropdownMenuCheckboxItem
            key={agent}
            checked={agents.includes(agent)}
            disabled={agents.length === 1 && agents.includes(agent)}
            onCheckedChange={(checked) => onAgentEnabledChange(agent, checked === true)}
            onClick={(event) => event.preventDefault()}
            closeOnClick={false}
          >
            <AgentIcon agent={agent} size={14} />
            {agentLabel(agent)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {translate('auto.components.right.sidebar.AiVaultPanelControls.sort', 'Sort')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(value) => onSortChange(value as AiVaultSort)}
        >
          <DropdownMenuRadioItem value="updated">
            <Clock3 className="size-3.5" />
            {translate(
              'auto.components.right.sidebar.AiVaultPanelControls.lastUpdated',
              'Last updated'
            )}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="created">
            <Calendar className="size-3.5" />
            {translate('auto.components.right.sidebar.AiVaultPanelControls.created', 'Created')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {translate('auto.components.right.sidebar.AiVaultPanelControls.group', 'Group')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={group}
          onValueChange={(value) => onGroupChange(value as AiVaultGroup)}
        >
          <DropdownMenuRadioItem value="project">
            <PanelsTopLeft className="size-3.5" />
            {translate('auto.components.right.sidebar.AiVaultPanelControls.project', 'Project')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="folder">
            <FolderOpen className="size-3.5" />
            {translate('auto.components.right.sidebar.AiVaultPanelControls.folder', 'Folder')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="agent">
            <ArchiveRestore className="size-3.5" />
            {translate('auto.components.right.sidebar.AiVaultPanelControls.agent', 'Agent')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={hideEmptySessions}
          onCheckedChange={(checked) => onHideEmptySessionsChange(checked === true)}
          onClick={(event) => event.preventDefault()}
          closeOnClick={false}
        >
          {translate(
            'auto.components.right.sidebar.AiVaultPanelControls.hideEmptySessions',
            'Hide empty sessions'
          )}
        </DropdownMenuCheckboxItem>
        {adjustmentCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReset}>
              {translate(
                'auto.components.right.sidebar.AiVaultPanelControls.resetView',
                'Reset view'
              )}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function EmptyState({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center px-4 text-center">
      <ArchiveRestore className="mb-3 size-7 opacity-50" />
      <p className="text-sm font-medium">{title}</p>
    </div>
  )
}

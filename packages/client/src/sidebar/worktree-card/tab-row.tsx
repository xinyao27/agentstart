import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { AgentActivityDisplayMode } from '@agentstart/protocol/settings/ui-state'
import { parsePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import type { Tab, TerminalTab } from '@agentstart/protocol/workspace/tabs'
import React from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import DashboardAgentRow from '~renderer/dashboard/agent-row'
import { isDismissibleAgentRow } from '~renderer/dashboard/agent-row-dismissible'
import type { DashboardAgentRow as DashboardAgentRowData } from '~renderer/dashboard/use-dashboard-data'
import { useNow } from '~renderer/dashboard/use-now'
import {
  DeviceMobile,
  FileText,
  GitBranch,
  GitDiff,
  Globe,
  TerminalWindow
} from '~renderer/icons/hugeicons'
import {
  activateRemoteRuntimeSessionTab,
  isRemoteRuntimeSessionActive
} from '~renderer/runtime/remote-runtime-session'
import { useAppStore } from '~renderer/store/state'
import { activateTabAndFocusPane } from '~renderer/tab-bar/activate-and-focus-pane'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import { resolveUnifiedTabLabel } from '~renderer/tab-title-resolution'
import { cn } from '~renderer/ui/class-names'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { useFocusedAgentPaneKey } from '../focused-agent-row-highlight'
import { openSidebarWorkspace } from '../host-navigation'
import { useWorktreeAgentRows } from '../use-worktree-agent-rows'
import { CompactAgentRow } from './compact-agent-row'
import type { SidebarOpenTab } from './open-tabs'

type WorktreeCardTabRowsProps = {
  displayMode: AgentActivityDisplayMode
  generatedTitlesEnabled: boolean
  rows: readonly SidebarOpenTab[]
  terminalTabs: readonly TerminalTab[]
  worktreeId: string
}

function activateSidebarTab(tab: Tab): void {
  const initialState = useAppStore.getState()
  const worktree = initialState.getKnownWorktreeById(tab.worktreeId)
  if (
    worktree &&
    openSidebarWorkspace({
      projectId: worktree.repoId,
      worktreeId: worktree.id,
      ...(tab.contentType === 'terminal' ? { sessionId: tab.entityId } : {})
    })
  ) {
    return
  }
  if (!activateAndRevealWorktree(tab.worktreeId)) {
    return
  }
  const state = useAppStore.getState()
  const currentTab = (state.unifiedTabsByWorktree[tab.worktreeId] ?? []).find(
    (candidate) => candidate.id === tab.id
  )
  if (!currentTab) {
    return
  }

  state.focusGroup(tab.worktreeId, currentTab.groupId)
  state.activateTab(currentTab.id)
  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(state, tab.worktreeId)

  switch (currentTab.contentType) {
    case 'terminal':
      if (isRemoteRuntimeSessionActive(runtimeEnvironmentId)) {
        void activateRemoteRuntimeSessionTab({
          worktreeId: tab.worktreeId,
          tabId: currentTab.entityId,
          environmentId: runtimeEnvironmentId
        })
      }
      state.setActiveTab(currentTab.entityId)
      state.setActiveTabType('terminal')
      focusTerminalTabSurface(currentTab.entityId)
      return
    case 'browser':
      if (isRemoteRuntimeSessionActive(runtimeEnvironmentId)) {
        void activateRemoteRuntimeSessionTab({
          worktreeId: tab.worktreeId,
          tabId: currentTab.id,
          environmentId: runtimeEnvironmentId
        })
      }
      state.setActiveBrowserTab(currentTab.entityId)
      state.setActiveTabType('browser')
      return
    case 'simulator':
      state.setActiveTab(currentTab.id)
      state.setActiveTabType('simulator')
      return
    case 'git-graph':
      state.setActiveTabType('editor')
      return
    case 'editor':
    case 'diff':
    case 'conflict-review':
    case 'check-details':
      state.setActiveFile(currentTab.entityId)
      state.setActiveTabType('editor')
  }
}

function SidebarTabIcon(props: {
  tab: Tab
  launchAgent?: TuiAgent
  size: 13 | 14
}): React.JSX.Element {
  const { tab, launchAgent, size } = props
  const className = cn('text-muted-foreground shrink-0', size === 13 ? 'size-[13px]' : 'size-3.5')
  switch (tab.contentType) {
    case 'terminal':
      return launchAgent ? (
        <span className="inline-flex shrink-0" aria-hidden>
          <AgentIcon agent={launchAgent} size={size} />
        </span>
      ) : (
        <TerminalWindow className={className} aria-hidden />
      )
    case 'browser':
      return <Globe className={className} aria-hidden />
    case 'simulator':
      return <DeviceMobile className={className} aria-hidden />
    case 'git-graph':
      return <GitBranch className={className} aria-hidden />
    case 'diff':
    case 'conflict-review':
    case 'check-details':
      return <GitDiff className={className} aria-hidden />
    case 'editor':
      return <FileText className={className} aria-hidden />
  }
}

function GenericTabRow(props: {
  displayMode: AgentActivityDisplayMode
  generatedTitlesEnabled: boolean
  launchAgent?: TuiAgent
  row: SidebarOpenTab
}): React.JSX.Element {
  const { row, launchAgent, generatedTitlesEnabled, displayMode } = props
  const label = resolveUnifiedTabLabel(row.tab, generatedTitlesEnabled, row.tab.label)
  const handleClick = () => activateSidebarTab(row.tab)
  const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation()

  if (displayMode === 'full') {
    return (
      <div
        className={cn(
          'group/agent-row relative -ml-2 flex cursor-pointer flex-col px-2 py-1 hover:bg-accent',
          row.isActive && 'bg-accent text-accent-foreground'
        )}
        role="tab"
        aria-selected={row.isActive}
        title={label}
        onClick={handleClick}
        onMouseDown={stopPropagation}
        onPointerDown={stopPropagation}
      >
        <div className="flex items-center gap-1.5">
          <SidebarTabIcon tab={row.tab} launchAgent={launchAgent} size={14} />
          <span
            className={cn(
              'block h-[1lh] min-w-0 flex-1 truncate text-[11px] leading-snug font-normal',
              row.isActive ? 'text-foreground/90' : 'text-muted-foreground'
            )}
          >
            {label}
          </span>
        </div>
      </div>
    )
  }
  return (
    <div
      draggable={false}
      className={cn(
        'group/agent-row flex h-6 min-w-0 cursor-pointer items-center gap-1 px-1 text-[11px] leading-none text-muted-foreground',
        row.isActive && 'bg-accent text-accent-foreground'
      )}
      role="tab"
      aria-selected={row.isActive}
      title={label}
      onClick={handleClick}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
      onDragStart={stopPropagation}
    >
      <SidebarTabIcon tab={row.tab} launchAgent={launchAgent} size={13} />
      <span className="min-w-0 flex-1 truncate">
        <span
          className={
            row.isActive
              ? 'text-foreground'
              : 'text-muted-foreground/90 group-hover/agent-row:text-foreground'
          }
        >
          {label}
        </span>
      </span>
    </div>
  )
}

function selectAgentForTab(
  agents: readonly DashboardAgentRowData[],
  tab: Tab
): DashboardAgentRowData | undefined {
  if (tab.contentType !== 'terminal') {
    return undefined
  }
  const matching = agents.filter((agent) => agent.tab.id === tab.entityId)
  return (
    matching.find((agent) => agent.rowSource !== 'subagent' && agent.lineage?.depth !== 1) ??
    matching.find((agent) => agent.rowSource !== 'subagent') ??
    matching[0]
  )
}

type AgentTabRowsProps = WorktreeCardTabRowsProps & {
  agentByUnifiedTabId: ReadonlyMap<string, DashboardAgentRowData>
  launchAgentByTabId: ReadonlyMap<string, TuiAgent | undefined>
}

const AgentTabRows = function AgentTabRows(props: AgentTabRowsProps): React.JSX.Element {
  const {
    agentByUnifiedTabId,
    displayMode,
    generatedTitlesEnabled,
    launchAgentByTabId,
    rows,
    worktreeId
  } = props
  const focusedAgentPaneKey = useFocusedAgentPaneKey(worktreeId)
  const now = useNow(30_000)
  const dropAgentStatus = useAppStore((state) => state.dropAgentStatus)
  const dismissRetainedAgent = useAppStore((state) => state.dismissRetainedAgent)
  const openTerminalTabByEntityId = (() =>
    new Map(
      rows.flatMap((row) =>
        row.tab.contentType === 'terminal' ? [[row.tab.entityId, row.tab] as const] : []
      )
    ))()
  const handleActivateAgent = (tabId: string, paneKey: string) => {
    const tab = openTerminalTabByEntityId.get(tabId)
    if (!tab) {
      return
    }
    activateSidebarTab(tab)
    const parsed = parsePaneKey(paneKey)
    if (!parsed || parsed.tabId !== tabId) {
      return
    }
    activateTabAndFocusPane(tabId, parsed.leafId, {
      ackPaneKeyOnSuccess: paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
  }
  const handleDismissAgent = (paneKey: string) => {
    dropAgentStatus(paneKey)
    dismissRetainedAgent(paneKey)
  }

  return (
    <>
      {rows.map((row) => {
        const agent = agentByUnifiedTabId.get(row.tab.id)
        if (agent && displayMode === 'compact') {
          return (
            <CompactAgentRow
              key={row.tab.id}
              agent={agent}
              now={now}
              onActivate={handleActivateAgent}
              isFocusedPane={agent.paneKey === focusedAgentPaneKey}
              onDismiss={isDismissibleAgentRow(agent) ? handleDismissAgent : undefined}
            />
          )
        }
        if (agent) {
          return (
            <DashboardAgentRow
              key={row.tab.id}
              agent={agent}
              now={now}
              onActivate={handleActivateAgent}
              onDismiss={handleDismissAgent}
              stateDotSize="sm"
              hideExpand
              isFocusedPane={agent.paneKey === focusedAgentPaneKey}
              hideLineageConnectors
            />
          )
        }
        return (
          <GenericTabRow
            key={row.tab.id}
            row={row}
            launchAgent={launchAgentByTabId.get(row.tab.entityId)}
            generatedTitlesEnabled={generatedTitlesEnabled}
            displayMode={displayMode}
          />
        )
      })}
    </>
  )
}

export const WorktreeCardTabRows = function WorktreeCardTabRows(
  props: WorktreeCardTabRowsProps
): React.JSX.Element {
  const { displayMode, generatedTitlesEnabled, rows, terminalTabs, worktreeId } = props
  const hasTerminalTab = rows.some((row) => row.tab.contentType === 'terminal')
  const agents = useWorktreeAgentRows(worktreeId, hasTerminalTab)
  const launchAgentByTabId = (() => new Map(terminalTabs.map((tab) => [tab.id, tab.launchAgent])))()
  const agentByUnifiedTabId = (() =>
    new Map(
      rows.flatMap((row) => {
        const agent = selectAgentForTab(agents, row.tab)
        return agent ? [[row.tab.id, agent] as const] : []
      })
    ))()

  if (agentByUnifiedTabId.size > 0) {
    return (
      <AgentTabRows
        {...props}
        agentByUnifiedTabId={agentByUnifiedTabId}
        launchAgentByTabId={launchAgentByTabId}
      />
    )
  }

  return (
    <>
      {rows.map((row) => (
        <GenericTabRow
          key={row.tab.id}
          row={row}
          launchAgent={launchAgentByTabId.get(row.tab.entityId)}
          generatedTitlesEnabled={generatedTitlesEnabled}
          displayMode={displayMode}
        />
      ))}
    </>
  )
}

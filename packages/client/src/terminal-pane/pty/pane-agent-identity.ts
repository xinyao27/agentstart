import { isTuiAgent } from '@agentstart/protocol/agent/identity'
import {
  isFreshNonDoneAgentStatus,
  type AgentType
} from '@agentstart/protocol/agent/status-records'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { agentTypeToIconAgent } from '~renderer/agent/status'
import { detectAgentStatusFromTitle } from '~renderer/agent/title/status'
import { resolvePaneAgentOwner } from '~renderer/pane-agent-owner'
import { useAppStore } from '~renderer/store/state'

import { resolveCommittedTitleAgentType } from '../agent/evidence'
import type { PtyConnectionDeps } from './connection-types'
import { createShellCommandAgentInference } from './shell-command-agent-inference'

type AppState = ReturnType<typeof useAppStore.getState>

type PaneAgentIdentityOptions = {
  paneKey: string
  tabId: string
  worktreeId: string
  paneId: number
  startup: PtyConnectionDeps['startup']
  getNeutralTitle: () => string
  getIsActivePane: () => boolean
  setRuntimePaneTitle: (title: string) => void
  updateTabTitle: (title: string) => void
}

export function createPaneAgentIdentity(options: PaneAgentIdentityOptions) {
  const getLiveTitle = (): string | null => {
    const state = useAppStore.getState()
    const runtimeTitle = state.runtimePaneTitlesByTabId?.[options.tabId]?.[options.paneId]
    const tabTitle = (state.tabsByWorktree[options.worktreeId] ?? []).find(
      (entry) => entry.id === options.tabId
    )?.title
    return runtimeTitle ?? tabTitle ?? null
  }

  const hasFreshSurface = (): boolean => {
    const entry = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
    return (
      isFreshNonDoneAgentStatus(entry) || detectAgentStatusFromTitle(getLiveTitle() ?? '') !== null
    )
  }

  const shellCommandInference = createShellCommandAgentInference({
    cacheKey: options.paneKey,
    hasFreshPaneAgentSurface: hasFreshSurface
  })

  const hasLiveHookIcon = (state: AppState): boolean => {
    const entry = state.agentStatusByPaneKey[options.paneKey]
    return entry?.state !== 'done' && Boolean(agentTypeToIconAgent(entry?.agentType))
  }

  const expectsLaunchAgent = (state: AppState): boolean => {
    const tab = (state.tabsByWorktree[options.worktreeId] ?? []).find(
      (candidate) => candidate.id === options.tabId
    )
    const registered = state.agentLaunchConfigByPaneKey[options.paneKey]?.identity.agentType
    return Boolean(
      tab?.launchAgent ??
      options.startup?.launchAgent ??
      options.startup?.initialAgentStatus?.agent ??
      (isTuiAgent(registered) ? registered : undefined)
    )
  }

  const clearStaleTitleOnConfirmedShell = (): void => {
    const state = useAppStore.getState()
    const runtimeTitle = state.runtimePaneTitlesByTabId?.[options.tabId]?.[options.paneId]
    const tab = (state.tabsByWorktree[options.worktreeId] ?? []).find(
      (entry) => entry.id === options.tabId
    )
    const title = runtimeTitle ?? tab?.title
    if (!title || resolveCommittedTitleAgentType(title) === null) {
      return
    }
    const neutralTitle = options.getNeutralTitle()
    options.setRuntimePaneTitle(neutralTitle)
    if (options.getIsActivePane()) {
      options.updateTabTitle(neutralTitle)
    }
  }

  return {
    shellCommandInference,
    hasFreshSurface,
    getAuthoritativeAgent: (): AgentType | undefined => {
      const state = useAppStore.getState()
      const tab = (state.tabsByWorktree[options.worktreeId] ?? []).find(
        (entry) => entry.id === options.tabId
      )
      return (
        resolvePaneAgentOwner({
          launchAgent: tab?.launchAgent,
          startupLaunchAgent: options.startup?.launchAgent,
          initialStatusAgent: options.startup?.initialAgentStatus?.agent,
          commandInferredAgent: shellCommandInference.getAgent(),
          hookAgent: state.agentStatusByPaneKey[options.paneKey]?.agentType
        }) ?? undefined
      )
    },
    getPaneScopedRendererOwner: (): AgentType | undefined => {
      const entry = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
      return (
        shellCommandInference.getAgent() ??
        (isFreshNonDoneAgentStatus(entry) ? entry.agentType : undefined)
      )
    },
    hasLiveHookIcon,
    expectsLaunchAgent,
    resolveExpectedLaunchAgent: (): TuiAgent | null => {
      const state = useAppStore.getState()
      const tab = (state.tabsByWorktree[options.worktreeId] ?? []).find(
        (candidate) => candidate.id === options.tabId
      )
      const candidate =
        tab?.launchAgent ??
        options.startup?.launchAgent ??
        options.startup?.initialAgentStatus?.agent ??
        state.agentLaunchConfigByPaneKey[options.paneKey]?.identity.agentType
      return isTuiAgent(candidate) ? candidate : null
    },
    hasKnownAgentIdentity: (): boolean => {
      const state = useAppStore.getState()
      const registered = state.agentLaunchConfigByPaneKey[options.paneKey]?.identity.agentType
      return (
        Boolean(state.paneForegroundAgentByPaneKey[options.paneKey]?.agent) ||
        hasLiveHookIcon(state) ||
        isTuiAgent(registered)
      )
    },
    clearStaleTitleOnConfirmedShell
  }
}

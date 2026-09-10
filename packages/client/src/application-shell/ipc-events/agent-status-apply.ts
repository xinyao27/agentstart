import { normalizeAgentStatusPayload } from '@agentstart/protocol/agent/status-parse'
import type { AgentStatusIpcPayload } from '@agentstart/protocol/agent/status-records'
import { parsePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import {
  resolveAgentStatusIdentity,
  shouldSuppressInheritedTerminalStatus
} from '~renderer/agent/status-state/identity'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'
import { resolveAgentPaneAuthorityKey } from '~renderer/terminal-pane/agent/pane-authority'
import { resolveAgentStatusTerminalTitle } from '~renderer/terminal-pane/agent/status-terminal-title'
import { shouldSuppressCodexAutoApprovalStatus } from '~renderer/terminal-pane/codex-auto-approval-notification-suppression'
import { isWslHookRelayConnectionId } from '~renderer/wsl-hook-relay-contract'

import { observeAgentHookCompletionForNotification } from '../agent-hook-completion-notifications'
import { hasRuntimeBackedAgentStatusAttribution } from '../pending-agent-status-retry'
import {
  applyResolvedAgentTerminalTitleToTab,
  isAgentStatusForRecentlyClosedTab,
  resolveHookPayloadAgentType,
  resolvePaneStatusRoute,
  resolveWorktreeStatusRoute
} from './agent-status-routing'

export type AgentStatusApplyResult = 'applied' | 'pending' | 'dropped'
type ApplyOptions = { replay?: boolean; retry?: boolean }

export function createAgentStatusApplier(
  enqueuePending: (data: AgentStatusIpcPayload, options?: { replay?: boolean }) => void,
  discardPendingForPane: (paneKey: string) => void
): (data: AgentStatusIpcPayload, options?: ApplyOptions) => AgentStatusApplyResult {
  return (data, options) => {
    const store = useAppStore.getState()
    if (!store.workspaceSessionReady || isAgentStatusForRecentlyClosedTab(store, data.paneKey)) {
      return 'dropped'
    }
    const paneKey = resolveAgentPaneAuthorityKey(data.paneKey)
    const ownerTabId = parsePaneKey(paneKey)?.tabId ?? data.tabId
    const payload = normalizeAgentStatusPayload({
      state: data.state,
      prompt: data.prompt,
      agentType: data.agentType,
      model: data.model,
      toolName: data.toolName,
      toolInput: data.toolInput,
      interactivePrompt: data.interactivePrompt,
      lastAssistantMessage: data.lastAssistantMessage,
      interrupted: data.interrupted,
      subagents: data.subagents
    })
    if (!payload) {
      return 'dropped'
    }

    let route = resolvePaneStatusRoute(store, paneKey)
    if (!route.exists && hasRuntimeBackedAgentStatusAttribution(data)) {
      const fallback = resolveWorktreeStatusRoute(store, data.worktreeId)
      if (fallback.worktreeExists) {
        route = {
          ...route,
          exists: true,
          owningWorktreeId: data.worktreeId,
          repoConnectionId: fallback.repoConnectionId,
          repoConnectionResolved: fallback.repoConnectionResolved
        }
      }
    }
    if (!route.exists) {
      if (options?.replay && hasRuntimeBackedAgentStatusAttribution(data)) {
        if (!options.retry) {
          enqueuePending(data, { replay: true })
        }
        return 'pending'
      }
      if (options?.replay) {
        return 'dropped'
      }
      if (!options?.retry) {
        track('agent_hook_unattributed', { reason: 'unknown_tab_id' })
        enqueuePending(data)
      }
      return 'pending'
    }
    if (!options?.replay && !options?.retry) {
      discardPendingForPane(data.paneKey)
    }

    const ownershipConnectionId = isWslHookRelayConnectionId(data.connectionId)
      ? null
      : data.connectionId
    const canAcceptPendingRemoteOwnership =
      ownershipConnectionId != null &&
      !route.repoConnectionResolved &&
      data.worktreeId === route.owningWorktreeId
    if (
      ownershipConnectionId !== undefined &&
      ownershipConnectionId !== route.repoConnectionId &&
      !canAcceptPendingRemoteOwnership
    ) {
      return 'dropped'
    }

    const existingStatus = store.agentStatusByPaneKey[paneKey]
    if (existingStatus && data.receivedAt < existingStatus.updatedAt) {
      return 'dropped'
    }
    if (data.providerSessionOnly) {
      if (!data.providerSession || data.agentType !== 'pi') {
        return 'dropped'
      }
      store.recordAgentProviderSession(
        paneKey,
        'pi',
        data.providerSession,
        { updatedAt: data.receivedAt },
        {
          tabId: ownerTabId,
          worktreeId: data.worktreeId ?? route.owningWorktreeId,
          ...(ownershipConnectionId !== undefined ? { connectionId: ownershipConnectionId } : {})
        },
        data.launchToken ? { launchToken: data.launchToken } : undefined
      )
      return 'applied'
    }

    const resolvedPayload = resolveHookPayloadAgentType(payload, route.identityTitle ?? route.title)
    const statusPayload = data.orchestration
      ? { ...resolvedPayload, orchestration: data.orchestration }
      : resolvedPayload
    const statusPayloadWithTurnBoundary = data.promptInteractionKey
      ? { ...statusPayload, promptInteractionKey: data.promptInteractionKey }
      : statusPayload
    const identity = resolveAgentStatusIdentity({
      existing: existingStatus
        ? {
            agentType: existingStatus.agentType,
            state: existingStatus.state,
            updatedAt: existingStatus.updatedAt
          }
        : undefined,
      incoming: statusPayload.agentType,
      now: data.receivedAt
    })
    if (
      existingStatus &&
      shouldSuppressInheritedTerminalStatus({
        inheritedFromActivePane: identity.inheritedFromActivePane,
        incomingState: statusPayload.state
      })
    ) {
      return 'dropped'
    }
    if (
      shouldSuppressCodexAutoApprovalStatus(statusPayload, {
        paneKey,
        tabId: ownerTabId,
        terminalHandle: data.terminalHandle,
        launchToken: data.launchToken,
        providerSession: data.providerSession,
        existingProviderSession: existingStatus?.providerSession
      })
    ) {
      return 'dropped'
    }

    const terminalTitle = resolveAgentStatusTerminalTitle(statusPayload, route.title)
    const statusWorktreeId = data.worktreeId ?? route.owningWorktreeId
    store.setAgentStatus(
      paneKey,
      statusPayloadWithTurnBoundary,
      terminalTitle,
      { updatedAt: data.receivedAt, stateStartedAt: data.stateStartedAt },
      {
        tabId: ownerTabId,
        worktreeId: statusWorktreeId,
        terminalHandle: data.terminalHandle,
        ...(ownershipConnectionId !== undefined ? { connectionId: ownershipConnectionId } : {})
      },
      data.providerSession || data.launchToken
        ? {
            ...(data.providerSession ? { providerSession: data.providerSession } : {}),
            ...(data.launchToken ? { launchToken: data.launchToken } : {})
          }
        : undefined
    )
    applyResolvedAgentTerminalTitleToTab(store, paneKey, route.title, terminalTitle)
    if (!options?.replay && statusWorktreeId) {
      observeAgentHookCompletionForNotification({
        paneKey,
        worktreeId: statusWorktreeId,
        payload:
          typeof data.stateStartedAt === 'number'
            ? { ...resolvedPayload, stateStartedAt: data.stateStartedAt }
            : resolvedPayload
      })
    }
    return 'applied'
  }
}

import {
  isFreshNonDoneAgentStatus,
  type AgentType
} from '@agentstart/protocol/agent/status-records'
import { resolveCompatibleAgentTypeForOwner } from '~renderer/agent/title/owner'
import { inspectRuntimeTerminalProcess } from '~renderer/runtime/terminal-inspection'
import { useAppStore } from '~renderer/store/state'

import { createAgentCompletionCoordinator } from '../agent/completion-coordinator'
import type { AgentCompletionCoordinator } from '../agent/completion-coordinator-types'
import { dispatchAgentHookTerminalLifecycle } from '../agent/hook-terminal-lifecycle'
import { createCodexAutoApprovalHookCompletionSuppressor } from '../codex-auto-approval-notification-suppression'
import {
  createAgentNotificationController,
  type AgentNotificationController
} from './agent-notification-controller'
import { isAgentTaskCompleteTrackingEnabled } from './agent-task-notification-settings'
import type { PtyConnectionDeps } from './connection-types'

type AgentCompletionSessionOptions = {
  paneKey: string
  tabId: string
  worktreeId: string
  launchToken: string | null
  getPtyId: () => string | null
  getIsDisposed: () => boolean
  getIsVisible: () => boolean
  getHasTabPty: () => boolean
  clearTitleCompletion: () => void
  setFocusReportSuppression: (title: string | undefined, agentType: AgentType | undefined) => void
  queueIdleTerminalModeReset: () => void
  dispatchNotification: PtyConnectionDeps['dispatchNotification']
  markWorktreeUnread: PtyConnectionDeps['markWorktreeUnread']
  markTerminalTabUnread: PtyConnectionDeps['markTerminalTabUnread']
  markTerminalPaneUnread: PtyConnectionDeps['markTerminalPaneUnread']
}

export type AgentCompletionSession = {
  coordinator: AgentCompletionCoordinator
  notifications: AgentNotificationController
}

export function createAgentCompletionSession(
  options: AgentCompletionSessionOptions
): AgentCompletionSession {
  const coordinator = createAgentCompletionCoordinator({
    paneKey: options.paneKey,
    getPtyId: options.getPtyId,
    getSettings: () => useAppStore.getState().settings,
    inspectProcess: inspectRuntimeTerminalProcess,
    dispatchHookLifecycle: (payload) =>
      dispatchAgentHookTerminalLifecycle(options.paneKey, payload),
    shouldSuppressProcessReplacementCompletion: (_exited, replacement) => {
      const currentStatus = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
      const currentAgent = resolveCompatibleAgentTypeForOwner(
        currentStatus?.agentType,
        replacement.agent
      )
      return isFreshNonDoneAgentStatus(currentStatus) && currentAgent === replacement.agent
    },
    shouldSuppressConfirmedProcessExitCompletion: (exited) => {
      const currentStatus = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
      const currentAgent = resolveCompatibleAgentTypeForOwner(
        currentStatus?.agentType,
        exited.agent
      )
      // Why: a replacement hook can lead process visibility by one cadence;
      // only a different known owner can veto confirmed old-process exit.
      return Boolean(
        isFreshNonDoneAgentStatus(currentStatus) &&
        currentStatus.agentType &&
        currentStatus.agentType !== 'unknown' &&
        currentAgent !== exited.agent
      )
    },
    dispatchCompletion: (title, meta) => {
      if (meta?.source === 'process-exit') {
        options.clearTitleCompletion()
      }
      if (meta?.terminalIdleConfirmed === true) {
        const currentStatus = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
        if (!isFreshNonDoneAgentStatus(currentStatus)) {
          options.setFocusReportSuppression(title, meta.agentStatus?.agentType)
        }
        options.queueIdleTerminalModeReset()
      }
      notifications.scheduleCompletion(title, {
        allowDoneDetailAfterGrace: meta?.quietedHookDone,
        ...(meta?.source === 'process-exit' ? { agentCompletionSource: meta.source } : {}),
        ...(meta?.agentStatus ? { agentStatusSnapshot: meta.agentStatus } : {})
      })
    },
    dispatchAttention: (title, meta) =>
      notifications.scheduleCompletion(title, { agentStatusSnapshot: meta.agentStatus }),
    shouldPollProcessCadence: () => isAgentTaskCompleteTrackingEnabled() && options.getIsVisible(),
    isProcessInspectionCostly: () => false,
    isLive: () =>
      !options.getIsDisposed() && (options.getPtyId() !== null || options.getHasTabPty()),
    shouldSuppressHookCompletion: createCodexAutoApprovalHookCompletionSuppressor(
      options.paneKey,
      () => ({
        tabId: options.tabId,
        ...(options.launchToken ? { launchToken: options.launchToken } : {})
      })
    )
  })
  const notifications = createAgentNotificationController({
    paneKey: options.paneKey,
    tabId: options.tabId,
    worktreeId: options.worktreeId,
    completionCoordinator: coordinator,
    getIsDisposed: options.getIsDisposed,
    dispatchNotification: options.dispatchNotification,
    markWorktreeUnread: options.markWorktreeUnread,
    markTerminalTabUnread: options.markTerminalTabUnread,
    markTerminalPaneUnread: options.markTerminalPaneUnread
  })
  return { coordinator, notifications }
}

import type { StateCreator } from 'zustand'
import { agentKindForAgentType } from '~renderer/agent/status'
import { formatAgentTypeLabel } from '~renderer/agent/title/type-label'
import { requireNotificationsTarget } from '~renderer/runtime/notifications-target'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import {
  deriveRunningAgentSendTargets,
  resolveRunningAgentSendTarget
} from '~renderer/sidebar/running-agent-targets'

import type { AppState } from '../../store/types'
import {
  resolvePaneKeyWorktreeIdFromTabs,
  collectAcknowledgedAgentNotificationId
} from './persistence-model'
import type { UISlice } from './slice'
import { createAgentSendTargetModeInstanceId } from './view-model'

export function createUIAgentSendActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'toggleSidebar'
  | 'setSidebarOpen'
  | 'setSidebarWidth'
  | 'openAgentSendPopoverTargetMode'
  | 'openDiffNotesSendMenuForActiveWorktree'
  | 'consumeDiffNotesSendMenuOpenRequest'
  | 'closeAgentSendPopoverTargetMode'
  | 'sendPromptToSidebarAgentTarget'
  | 'acknowledgeAgents'
  | 'unacknowledgeAgents'
> {
  return {
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setSidebarWidth: (width) => set({ sidebarWidth: width }),
    openAgentSendPopoverTargetMode: (args) => {
      const targets = deriveRunningAgentSendTargets(get(), args.worktreeId)
      const previousMode = get().agentSendPopoverTargetMode
      if (previousMode?.id === args.id && previousMode.status === 'sending') {
        return
      }
      const disabledPaneKeys: Record<string, string> = {}
      for (const target of targets) {
        if (target.status === 'disabled' && target.disabledReason) {
          disabledPaneKeys[target.paneKey] = target.disabledReason
        }
      }
      set({
        agentSendPopoverTargetMode: {
          ...args,
          instanceId: createAgentSendTargetModeInstanceId(),
          eligiblePaneKeys: targets
            .filter((target) => target.status === 'eligible')
            .map((target) => target.paneKey),
          disabledPaneKeys,
          status: 'open'
        }
      })
      if (
        targets.some((target) => target.status === 'eligible') &&
        (previousMode?.id !== args.id || previousMode.worktreeId !== args.worktreeId)
      ) {
        get().revealWorktreeInSidebar(args.worktreeId, { behavior: 'auto', highlight: true })
      }
    },
    openDiffNotesSendMenuForActiveWorktree: () => {
      const worktreeId = get().activeWorktreeId
      if (
        !worktreeId ||
        !get()
          .getDiffComments(worktreeId)
          .some((comment) => !comment.sentAt)
      ) {
        return false
      }
      const nonce = (get().diffNotesSendMenuOpenRequest?.nonce ?? 0) + 1
      set({ diffNotesSendMenuOpenRequest: { worktreeId, nonce, issuedAt: Date.now() } })
      return true
    },
    consumeDiffNotesSendMenuOpenRequest: (worktreeId) =>
      set((state) =>
        state.diffNotesSendMenuOpenRequest?.worktreeId === worktreeId
          ? { diffNotesSendMenuOpenRequest: null }
          : state
      ),
    closeAgentSendPopoverTargetMode: (id, instanceId) =>
      set((s) => {
        if (!s.agentSendPopoverTargetMode) {
          return s
        }
        if (id && s.agentSendPopoverTargetMode.id !== id) {
          return s
        }
        if (instanceId && s.agentSendPopoverTargetMode.instanceId !== instanceId) {
          return s
        }
        return { agentSendPopoverTargetMode: null }
      }),
    sendPromptToSidebarAgentTarget: async (paneKey) => {
      const mode = get().agentSendPopoverTargetMode
      if (!mode || mode.status === 'sending') {
        return false
      }

      const target = resolveRunningAgentSendTarget(get(), mode.worktreeId, paneKey)
      if (!target || target.status !== 'eligible' || !target.ptyId) {
        // Why: live revalidation can lose eligibility after the user opened the
        // menu. Treat that like an ineligible row click: keep the picker open and
        // let the row title explain the current reason without adding toast noise.
        return false
      }

      set((s) =>
        s.agentSendPopoverTargetMode?.id === mode.id &&
        s.agentSendPopoverTargetMode.instanceId === mode.instanceId
          ? {
              agentSendPopoverTargetMode: {
                ...s.agentSendPopoverTargetMode,
                status: 'sending',
                sendingPaneKey: paneKey,
                error: undefined
              }
            }
          : s
      )

      const label = formatAgentTypeLabel(target.entry.agentType)
      const { activeAgentNotesSendFailureMessage, sendNotesToActiveAgentSession } =
        await import('~renderer/editor/active-agent-note-send')
      const result = await sendNotesToActiveAgentSession({
        state: get(),
        worktreeId: mode.worktreeId,
        prompt: mode.prompt,
        noteTarget: { tabId: target.tabId, leafId: target.leafId }
      }).catch((error) => {
        console.error('Failed to send notes to sidebar agent target:', error)
        return { status: 'no-active-terminal' as const }
      })

      const stillCurrent = (): boolean => {
        const current = get().agentSendPopoverTargetMode
        return current?.id === mode.id && current.instanceId === mode.instanceId
      }

      if (!stillCurrent()) {
        return false
      }

      if (result.status !== 'sent') {
        const message = activeAgentNotesSendFailureMessage(result.status, { explicitTarget: true })
        set((s) =>
          s.agentSendPopoverTargetMode?.id === mode.id &&
          s.agentSendPopoverTargetMode.instanceId === mode.instanceId
            ? {
                agentSendPopoverTargetMode: {
                  ...s.agentSendPopoverTargetMode,
                  status: 'error',
                  sendingPaneKey: undefined,
                  error: message
                }
              }
            : s
        )
        if (!stillCurrent()) {
          return false
        }
        publishRendererCommandResult({
          type: 'agent-note-send',
          outcome: 'failed',
          label,
          error: message
        })
        return false
      }

      const { track } = await import('~renderer/telemetry/client')
      if (!stillCurrent()) {
        return false
      }
      mode.onPromptDelivered?.()
      track('agent_prompt_sent', {
        agent_kind: agentKindForAgentType(target.entry.agentType),
        launch_source: mode.launchSource,
        request_kind: 'followup'
      })
      publishRendererCommandResult({ type: 'agent-note-send', outcome: 'succeeded', label })
      get().closeAgentSendPopoverTargetMode(mode.id, mode.instanceId)
      return true
    },
    acknowledgeAgents: (paneKeys) => {
      const notificationIdsToDismiss = new Set<string>()
      set((s) => {
        if (paneKeys.length === 0) {
          return s
        }
        const now = Date.now()
        // Why: only allocate a new map (and emit a store update) if at least
        // one ack is actually moving forward. Comparing `prev < now` instead
        // of `prev !== now` matters because stored values are historical
        // timestamps and `Date.now()` advances every millisecond — a strict-
        // inequality guard would fire on every call and rewrite the map on
        // every dashboard click or auto-ack tick, forcing every subscriber
        // (all agent rows, the SidebarHeader count, etc.) to re-render.
        let next: Record<string, number> | null = null
        for (const key of paneKeys) {
          const prev = s.acknowledgedAgentsByPaneKey[key] ?? 0
          const liveEntry = s.agentStatusByPaneKey?.[key]
          if (liveEntry) {
            collectAcknowledgedAgentNotificationId({
              ids: notificationIdsToDismiss,
              worktreeId: resolvePaneKeyWorktreeIdFromTabs(s, key) ?? liveEntry.worktreeId,
              paneKey: key,
              stateStartedAt: liveEntry.stateStartedAt,
              previousAckAt: prev
            })
          }
          const retained = s.retainedAgentsByPaneKey?.[key]
          if (retained) {
            collectAcknowledgedAgentNotificationId({
              ids: notificationIdsToDismiss,
              worktreeId: retained.worktreeId,
              paneKey: key,
              stateStartedAt: retained.entry.stateStartedAt,
              previousAckAt: prev
            })
          }
          if (prev < now) {
            if (next === null) {
              next = { ...s.acknowledgedAgentsByPaneKey }
            }
            next[key] = now
          }
        }
        return next ? { acknowledgedAgentsByPaneKey: next } : s
      })
      const notificationIds = [...notificationIdsToDismiss]
      if (notificationIds.length > 0) {
        void requireNotificationsTarget(getActiveRuntimeTarget(get().settings)).then((client) =>
          client.dismiss(notificationIds)
        )
      }
    },
    unacknowledgeAgents: (paneKeys) =>
      set((s) => {
        if (paneKeys.length === 0) {
          return s
        }
        let next: Record<string, number> | null = null
        for (const key of paneKeys) {
          if (s.acknowledgedAgentsByPaneKey[key] !== undefined) {
            if (next === null) {
              next = { ...s.acknowledgedAgentsByPaneKey }
            }
            delete next[key]
          }
        }
        return next ? { acknowledgedAgentsByPaneKey: next } : s
      })
  }
}

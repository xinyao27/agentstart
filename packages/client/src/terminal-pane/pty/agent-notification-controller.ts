import {
  isFreshNonDoneAgentStatus,
  type AgentStatusEntry
} from '@yiru/protocol/agent/status-records'
import { resolveCompatibleAgentTypeForOwner } from '~renderer/agent/title/owner'
import { useAppStore } from '~renderer/store/state'

import type {
  AgentCompletionCoordinator,
  AgentCompletionDispatchMeta,
  AgentCompletionStatusSnapshot
} from '../agent/completion-coordinator-types'
import {
  AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS,
  AGENT_TASK_COMPLETE_NOTIFICATION_MAX_WAIT_MS,
  canDispatchAgentNotificationAfterGrace
} from '../agent/task-complete-policy'
import {
  isAgentTaskCompleteNotificationEnabled,
  isAgentTaskCompleteTrackingEnabled,
  subscribeAgentTaskCompleteTrackingEnabled
} from './agent-task-notification-settings'
import type { PtyConnectionDeps } from './connection-types'

type CompletionOptions = {
  allowDoneDetailAfterGrace?: boolean
  agentStatusSnapshot?: AgentCompletionStatusSnapshot
  agentCompletionSource?: AgentCompletionDispatchMeta['source']
}

type AgentNotificationControllerOptions = {
  paneKey: string
  tabId: string
  worktreeId: string
  completionCoordinator: AgentCompletionCoordinator
  getIsDisposed: () => boolean
  dispatchNotification: PtyConnectionDeps['dispatchNotification']
  markWorktreeUnread: PtyConnectionDeps['markWorktreeUnread']
  markTerminalTabUnread: PtyConnectionDeps['markTerminalTabUnread']
  markTerminalPaneUnread: PtyConnectionDeps['markTerminalPaneUnread']
}

export type AgentNotificationController = {
  onBell: () => void
  observeTitle: (title: string) => void
  observeClassifiedTitleCompletion: (title: string) => void
  observeTitleWorking: () => void
  observeHookStatus: (payload: AgentCompletionStatusSnapshot) => void
  scheduleCompletion: (title: string, options?: CompletionOptions) => void
  dispose: () => void
}

export function createAgentNotificationController(
  options: AgentNotificationControllerOptions
): AgentNotificationController {
  let graceTimer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let statusUnsubscribe: (() => void) | null = null
  let notificationGeneration = 0
  let wasTrackingEnabled = isAgentTaskCompleteTrackingEnabled()
  let requiresFreshWorking = !wasTrackingEnabled
  let wasOsNotificationEnabled = isAgentTaskCompleteNotificationEnabled()
  let bellTimer: ReturnType<typeof setTimeout> | null = null
  let hasPendingBell = false

  const clearBellTimer = (): void => {
    if (bellTimer !== null) {
      clearTimeout(bellTimer)
      bellTimer = null
    }
  }

  const hasPendingCompletion = (): boolean =>
    isAgentTaskCompleteNotificationEnabled() &&
    (options.completionCoordinator.hasPendingHookDoneCompletion() ||
      graceTimer !== null ||
      maxTimer !== null ||
      statusUnsubscribe !== null)

  const scheduleBell = (): void => {
    if (bellTimer !== null) {
      return
    }
    bellTimer = setTimeout(() => {
      bellTimer = null
      if (options.getIsDisposed()) {
        hasPendingBell = false
        return
      }
      if (hasPendingCompletion()) {
        return
      }
      hasPendingBell = false
      options.dispatchNotification({ source: 'terminal-bell', paneKey: options.paneKey })
    }, AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS)
  }

  const clearPendingCompletion = (): void => {
    if (graceTimer !== null) {
      clearTimeout(graceTimer)
      graceTimer = null
    }
    if (maxTimer !== null) {
      clearTimeout(maxTimer)
      maxTimer = null
    }
    if (statusUnsubscribe !== null) {
      statusUnsubscribe()
      statusUnsubscribe = null
    }
  }

  const syncTrackingEnabled = (): boolean => {
    const isTrackingEnabled = isAgentTaskCompleteTrackingEnabled()
    const isOsNotificationEnabled = isAgentTaskCompleteNotificationEnabled()
    if (!isOsNotificationEnabled && wasOsNotificationEnabled && hasPendingBell) {
      scheduleBell()
    }
    if (!isTrackingEnabled && wasTrackingEnabled) {
      // Why: disabling every completion consumer is an event-time boundary.
      // Drop pending alerts while preserving accepted-hook lifecycle state.
      notificationGeneration += 1
      requiresFreshWorking = true
      clearPendingCompletion()
      if (hasPendingBell) {
        scheduleBell()
      }
    } else if (isTrackingEnabled && !wasTrackingEnabled) {
      // Why: work may have happened while every consumer was disabled. The
      // next idle transition cannot report it until fresh working evidence.
      requiresFreshWorking = true
    }
    wasTrackingEnabled = isTrackingEnabled
    wasOsNotificationEnabled = isOsNotificationEnabled
    return isTrackingEnabled
  }

  const hasNewerActiveHookStatus = (
    agentStatusAtSchedule: AgentStatusEntry | undefined,
    completionOptions: CompletionOptions
  ): boolean => {
    const currentStatus = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
    const scheduledAgentType = agentStatusAtSchedule?.agentType
    const currentAgentForScheduledTurn = resolveCompatibleAgentTypeForOwner(
      currentStatus?.agentType,
      scheduledAgentType
    )
    const hasDifferentKnownAgent = Boolean(
      currentStatus?.agentType &&
      scheduledAgentType &&
      currentStatus.agentType !== 'unknown' &&
      scheduledAgentType !== 'unknown' &&
      currentAgentForScheduledTurn !== scheduledAgentType
    )
    return (
      completionOptions.agentCompletionSource === 'process-exit' &&
      isFreshNonDoneAgentStatus(currentStatus) &&
      (!agentStatusAtSchedule ||
        currentStatus.state !== agentStatusAtSchedule.state ||
        currentStatus.stateStartedAt !== agentStatusAtSchedule.stateStartedAt ||
        hasDifferentKnownAgent)
    )
  }

  const scheduleCompletion = (title: string, completionOptions: CompletionOptions = {}): void => {
    if (!syncTrackingEnabled() || requiresFreshWorking) {
      return
    }
    clearPendingCompletion()
    let graceElapsed = false
    const generationAtSchedule = notificationGeneration
    const agentStatusAtSchedule = useAppStore.getState().agentStatusByPaneKey[options.paneKey]

    const dispatch = (): void => {
      clearPendingCompletion()
      if (
        generationAtSchedule !== notificationGeneration ||
        !syncTrackingEnabled() ||
        hasNewerActiveHookStatus(agentStatusAtSchedule, completionOptions) ||
        options.getIsDisposed()
      ) {
        return
      }
      const shouldDispatchOsNotification = isAgentTaskCompleteNotificationEnabled()
      hasPendingBell = false
      clearBellTimer()
      options.dispatchNotification({
        source: 'agent-task-complete',
        terminalTitle: title,
        paneKey: options.paneKey,
        ...(completionOptions.agentCompletionSource
          ? { agentCompletionSource: completionOptions.agentCompletionSource }
          : {}),
        ...(shouldDispatchOsNotification ? {} : { suppressOsNotification: true }),
        ...(completionOptions.agentStatusSnapshot
          ? { agentStatusSnapshot: completionOptions.agentStatusSnapshot }
          : {})
      })
    }

    const dispatchIfDetailed = (): void => {
      if (hasNewerActiveHookStatus(agentStatusAtSchedule, completionOptions)) {
        clearPendingCompletion()
        return
      }
      if (!graceElapsed) {
        return
      }
      const entry = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
      if (canDispatchAgentNotificationAfterGrace(entry, completionOptions)) {
        dispatch()
      }
    }

    statusUnsubscribe = useAppStore.subscribe(dispatchIfDetailed)
    graceTimer = setTimeout(() => {
      graceTimer = null
      graceElapsed = true
      dispatchIfDetailed()
    }, AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS)
    // Why: some agents never surface assistant text through hooks. Keep a hard
    // cap so completion notifications still fire instead of waiting forever.
    maxTimer = setTimeout(dispatch, AGENT_TASK_COMPLETE_NOTIFICATION_MAX_WAIT_MS)
  }

  const settingsUnsubscribe = subscribeAgentTaskCompleteTrackingEnabled(() => {
    if (syncTrackingEnabled()) {
      options.completionCoordinator.startProcessTracking()
    }
  })

  return {
    onBell: () => {
      options.markWorktreeUnread(options.worktreeId)
      options.markTerminalTabUnread(options.tabId)
      if (useAppStore.getState().settings?.experimentalTerminalAttention === true) {
        options.markTerminalPaneUnread(options.paneKey)
      }
      // Why: agent CLIs often emit BEL in the same completion burst. Delay
      // only the OS notification so the richer completion can win the race.
      hasPendingBell = true
      if (!hasPendingCompletion()) {
        scheduleBell()
      }
    },
    observeTitle: (title) => {
      if (syncTrackingEnabled()) {
        options.completionCoordinator.observeTitle(title)
      }
    },
    observeClassifiedTitleCompletion: (title) => {
      if (syncTrackingEnabled()) {
        options.completionCoordinator.observeClassifiedTitleCompletion(title)
      }
    },
    observeTitleWorking: () => {
      if (syncTrackingEnabled()) {
        requiresFreshWorking = false
        options.completionCoordinator.observeTitleWorking()
      }
      clearPendingCompletion()
      if (hasPendingBell) {
        scheduleBell()
      }
    },
    observeHookStatus: (payload) => {
      const isTrackingEnabled = syncTrackingEnabled()
      if (payload.state === 'working' && isTrackingEnabled) {
        requiresFreshWorking = false
      }
      // Why: hook lifecycle owns deferred terminal effects even when every
      // outward completion alert consumer is disabled.
      options.completionCoordinator.observeHookStatus(payload)
      if (payload.state === 'working' && hasPendingBell) {
        scheduleBell()
      }
    },
    scheduleCompletion,
    dispose: () => {
      clearPendingCompletion()
      hasPendingBell = false
      clearBellTimer()
      settingsUnsubscribe()
    }
  }
}

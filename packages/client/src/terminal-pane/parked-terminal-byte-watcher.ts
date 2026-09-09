import { makePaneKey } from '@yiru/protocol/terminal/pane-identity'
/**
 * Parked terminal side-effect watcher.
 *
 * Why: parking unmounts the TerminalPane subtree, which tears down the pane's
 * side-effect consumers — the parked tab's only source of bell, title,
 * agent-completion, and PR-link policy. (Losing them is the gap that sank the
 * first parking attempt.) The multiplex subscription remains fact-driven
 * while output delivery is gated; reveal restores the authoritative snapshot.
 */
import { isClaudeAgent } from '~renderer/agent/title/identity'
import { useAppStore } from '~renderer/store/state'
import {
  mode2031SequenceFor,
  resolveTerminalColorSchemeMode
} from '~renderer/terminal-pane/emulator/color-scheme'
import { getSystemPrefersDark } from '~renderer/terminal/theme'

import {
  AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS,
  isAgentTaskCompleteOsNotificationEnabledFromState,
  isAgentTaskCompleteTrackingEnabledFromState
} from './agent/task-complete-policy'
import { createParkedTerminalCommandStatusPolicy } from './parked-command-status'
import { subscribeToPtyData } from './pty/data-sidecar-subscriptions'
import { registerTerminalSideEffectFactConsumer } from './terminal-side-effect-facts-handler'
import { dispatchTerminalNotification } from './use-notification-dispatch'

// Why: mirrors AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS in pty-connection.ts.
// The parked path must keep the live path's BEL-vs-completion race window so
// notification behavior is identical whether a tab is parked or mounted.
const PARKED_NOTIFICATION_GRACE_MS = AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS

type StoreState = ReturnType<typeof useAppStore.getState>

function isAgentTaskCompleteOsNotificationEnabled(state: StoreState): boolean {
  return isAgentTaskCompleteOsNotificationEnabledFromState(state)
}

function isAgentTaskCompleteTrackingEnabled(state: StoreState): boolean {
  return isAgentTaskCompleteTrackingEnabledFromState(state)
}

export type ParkedTerminalByteWatcherOptions = {
  ptyId: string
  tabId: string
  worktreeId: string
  /** Stable terminal-layout leaf UUID. Combined with tabId into the paneKey
   *  used for cache-timer, unread, and notification attribution. */
  leafId: string
  /** PaneManager pane id the unmounted pane used. Runtime pane titles are
   *  keyed by it, so the watcher must write the slot the live path wrote —
   *  a different id would leave a stale (possibly "working") title behind. */
  paneId: number
  /** Whether this PTY's pane was the tab's active split pane. Mirrors the
   *  live path, where only the focused split drives the tab title. */
  drivesTabTitle?: boolean
  /** The pane's last known runtime title at park time. Seeds the agent
   *  tracker so an agent that was working when the pane unmounted still
   *  fires its completion when it goes idle while parked. */
  initialTitle?: string
  /** Pull main's title-only snapshot when a watcher starts before its pane
   *  has ever mounted. Ordinary park cycles already have a current title. */
  /** Out-of-band reply channel to the PTY (mode-2031 color-scheme answers). */
  sendInput: (data: string) => void
}

const parkedWatcherDisposersByPtyId = new Map<string, () => void>()

export function startParkedTerminalByteWatcher(
  options: ParkedTerminalByteWatcherOptions
): () => void {
  const { ptyId, tabId, worktreeId, paneId, sendInput } = options
  const drivesTabTitle = options.drivesTabTitle ?? true
  const paneKey = makePaneKey(tabId, options.leafId)

  // Why: one watcher per PTY. A stale watcher from a previous park cycle would
  // double-fire bell/completion side effects for the same bytes.
  parkedWatcherDisposersByPtyId.get(ptyId)?.()

  let disposed = false
  let pendingBellNotification = false
  // Why: a watcher-written runtime title (especially into a negative fallback
  // slot) has no live pane to overwrite it after reveal; a stale 'working'
  // entry would pin worktree status forever. Track writes so dispose can
  // clear exactly the slot this watcher touched.
  let wroteRuntimeTitleSlot = false
  let bellNotificationTimer: ReturnType<typeof setTimeout> | null = null
  let agentTaskCompleteTimer: ReturnType<typeof setTimeout> | null = null

  const clearBellNotificationTimer = (): void => {
    if (bellNotificationTimer !== null) {
      clearTimeout(bellNotificationTimer)
      bellNotificationTimer = null
    }
  }

  const clearAgentTaskCompleteTimer = (): void => {
    if (agentTaskCompleteTimer !== null) {
      clearTimeout(agentTaskCompleteTimer)
      agentTaskCompleteTimer = null
    }
  }

  // Why: like the live path, a BEL OS notification only yields when the
  // pending completion would itself produce an OS notification.
  const hasPendingAgentTaskCompleteNotification = (): boolean =>
    agentTaskCompleteTimer !== null &&
    isAgentTaskCompleteOsNotificationEnabled(useAppStore.getState())

  const scheduleTerminalBellNotification = (): void => {
    if (bellNotificationTimer !== null) {
      return
    }
    bellNotificationTimer = setTimeout(() => {
      bellNotificationTimer = null
      if (disposed) {
        pendingBellNotification = false
        return
      }
      if (hasPendingAgentTaskCompleteNotification()) {
        return
      }
      pendingBellNotification = false
      dispatchTerminalNotification(worktreeId, { source: 'terminal-bell', paneKey })
    }, PARKED_NOTIFICATION_GRACE_MS)
  }

  // Why: one policy block for both consumption modes — byte parsing (kill
  // switch off) and pty:sideEffect facts (main authority on). The semantics
  // must be identical or flipping the switch changes notification behavior.
  const sideEffectCallbacks = {
    onTitleChange: (title: string): void => {
      const state = useAppStore.getState()
      wroteRuntimeTitleSlot = true
      state.setRuntimePaneTitle(tabId, paneId, title)
      if (drivesTabTitle) {
        state.updateTabTitle(tabId, title)
      }
    },
    onBell: (): void => {
      const state = useAppStore.getState()
      state.markWorktreeUnread(worktreeId)
      state.markTerminalTabUnread(tabId)
      if (state.settings?.experimentalTerminalAttention === true) {
        state.markTerminalPaneUnread(paneKey)
      }
      // Why: agent CLIs often emit BEL in the same completion burst as their
      // working→idle title change. Delay only the OS notification so the
      // richer agent-task-complete notification can win (live-path parity).
      pendingBellNotification = true
      if (!hasPendingAgentTaskCompleteNotification()) {
        scheduleTerminalBellNotification()
      }
    },
    onAgentBecameIdle: (title: string, meta?: { staleWorkingTitleClear?: boolean }): void => {
      // Why: stale-derived idles come from main's unthrottled 3s timer, not
      // observed bytes — clear session state, never schedule the completion
      // notification a merely-paused agent did not earn (live-path parity).
      if (meta?.staleWorkingTitleClear) {
        useAppStore.getState().setCacheTimerStartedAt(paneKey, null)
        return
      }
      const state = useAppStore.getState()
      // Why: mirrors pty-connection — null settings means "not hydrated yet";
      // a spurious timestamp is harmless while a dropped one loses the timer.
      if (
        isClaudeAgent(title) &&
        (state.settings === null || state.settings.promptCacheTimerEnabled)
      ) {
        state.setCacheTimerStartedAt(paneKey, Date.now())
      }
      if (!isAgentTaskCompleteTrackingEnabled(state)) {
        return
      }
      clearAgentTaskCompleteTimer()
      agentTaskCompleteTimer = setTimeout(() => {
        agentTaskCompleteTimer = null
        if (disposed) {
          return
        }
        // Why: the completion supersedes a concurrent BEL so each completion
        // burst yields exactly one OS notification, same as the live path.
        pendingBellNotification = false
        clearBellNotificationTimer()
        dispatchTerminalNotification(worktreeId, {
          source: 'agent-task-complete',
          terminalTitle: title,
          paneKey,
          ...(isAgentTaskCompleteOsNotificationEnabled(useAppStore.getState())
            ? {}
            : { suppressOsNotification: true })
        })
      }, PARKED_NOTIFICATION_GRACE_MS)
    },
    onAgentBecameWorking: (): void => {
      // Why: a new API call refreshes the prompt-cache TTL, so clear any
      // running countdown; it restarts when the agent next becomes idle.
      useAppStore.getState().setCacheTimerStartedAt(paneKey, null)
      clearAgentTaskCompleteTimer()
      if (pendingBellNotification) {
        scheduleTerminalBellNotification()
      }
    },
    onAgentExited: (): void => {
      // Why: title reverting to a plain shell means the agent session ended;
      // a stale countdown must not survive in the sidebar while parked.
      useAppStore.getState().setCacheTimerStartedAt(paneKey, null)
    }
  }

  const commandStatusPolicy = createParkedTerminalCommandStatusPolicy({
    ptyId,
    worktreeId,
    tabId,
    paneId,
    paneKey
  })

  const sendMode2031Reply = (): void => {
    const settings = useAppStore.getState().settings
    sendInput(mode2031SequenceFor(resolveTerminalColorSchemeMode(settings, getSystemPrefersDark())))
  }

  const unregisterFactConsumer = registerTerminalSideEffectFactConsumer({
    ptyId,
    callbacks: {
      ...sideEffectCallbacks,
      onCommandFinished: commandStatusPolicy.onCommandFinished,
      onCommandCodeWorking: commandStatusPolicy.onCommandCodeWorking,
      onCommandCodeDone: commandStatusPolicy.onCommandCodeDone,
      onPrLink: (link) =>
        useAppStore.getState().observeTerminalGitHubPullRequestLink(worktreeId, link),
      onMode2031Subscribe: sendMode2031Reply
    }
  })
  // Why: the parked subscription carries side-effect batches while its
  // output delivery stays gated; the byte callback intentionally does nothing.
  const unsubscribeRuntimeEvents = subscribeToPtyData(ptyId, () => {})

  const dispose = (): void => {
    if (disposed) {
      return
    }
    disposed = true
    unsubscribeRuntimeEvents()
    unregisterFactConsumer()
    commandStatusPolicy.dispose()
    clearBellNotificationTimer()
    clearAgentTaskCompleteTimer()
    pendingBellNotification = false
    // Why: the store merge never deletes title slots, so a watcher-written
    // entry would strand after reveal (the revealing pane re-registers under
    // its own pane id) and could pin worktree status 'working'. The revealed
    // pane repopulates its slot via its own title flow.
    if (wroteRuntimeTitleSlot) {
      wroteRuntimeTitleSlot = false
      useAppStore.getState().clearRuntimePaneTitle(tabId, paneId)
    }
    if (parkedWatcherDisposersByPtyId.get(ptyId) === dispose) {
      parkedWatcherDisposersByPtyId.delete(ptyId)
    }
  }
  parkedWatcherDisposersByPtyId.set(ptyId, dispose)
  return dispose
}

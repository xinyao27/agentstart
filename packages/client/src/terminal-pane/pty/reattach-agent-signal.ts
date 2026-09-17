import type { Terminal } from '@xterm/xterm'
import { detectAgentStatusFromTitle } from '~renderer/agent/title/status'
import { useAppStore } from '~renderer/store/state'

import { resolveCommittedTitleAgentType } from '../agent/evidence'
import {
  CURSOR_AGENT_REATTACH_HEADER,
  hasCursorAgentReattachPayloadScreenSignal,
  terminalOwnsDomFocus
} from './cursor-agent-reattach'

const IDLE_CURSOR_RESET_DELAY_MS = 250

type ReattachAgentSignalOptions = {
  terminal: Terminal
  paneKey: string
  tabId: string
  worktreeId: string
  paneId: number
  getIsDisposed: () => boolean
  queueIdleTerminalModeReset: () => void
}

export type ReattachAgentSignal = {
  rememberPayload: (data: string, options: { fullScreenReplay: boolean }) => void
  getSignalGeneration: () => number
  getHasCursorAgentSignal: () => boolean
  clearCursorAgentSignal: () => void
  hasLiveStatusOrTitle: () => boolean
  shouldPreserveModes: () => boolean
  shouldSendFocusIn: () => boolean
  scheduleIdleCursorReset: () => void
  dispose: () => void
}

export function createReattachAgentSignal(
  options: ReattachAgentSignalOptions
): ReattachAgentSignal {
  let hasCursorAgentSignal = false
  let signalGeneration = 0
  let idleCursorResetTimer: ReturnType<typeof setTimeout> | null = null

  const getCurrentTitle = (): string | null => {
    const state = useAppStore.getState()
    const runtimeTitle = state.runtimePaneTitlesByTabId?.[options.tabId]?.[options.paneId]
    const tabTitle = (state.tabsByWorktree[options.worktreeId] ?? []).find(
      (entry) => entry.id === options.tabId
    )?.title
    return runtimeTitle ?? tabTitle ?? null
  }

  const hasLiveStatusOrTitle = (): boolean => {
    if (useAppStore.getState().agentStatusByPaneKey[options.paneKey]) {
      return true
    }
    const title = getCurrentTitle() ?? ''
    return (
      detectAgentStatusFromTitle(title) !== null ||
      title.trim().toLowerCase() === CURSOR_AGENT_REATTACH_HEADER.toLowerCase()
    )
  }

  const dispose = (): void => {
    if (idleCursorResetTimer !== null) {
      clearTimeout(idleCursorResetTimer)
      idleCursorResetTimer = null
    }
  }

  // Why: OpenCode's native `OC | <task>` titles carry agent identity without a
  // status keyword, so status detection alone reads a live pane as dead and the
  // reattach reset strips the mouse protocols its wheel events need.
  const hasCommittedAgentTitle = (): boolean =>
    resolveCommittedTitleAgentType(getCurrentTitle() ?? '') !== null

  // Why: a foreground agent process is process-grade proof the pane is live even
  // before its title has been republished; a proven shell must not preserve modes.
  const hasForegroundAgentProcess = (): boolean => {
    const entry = useAppStore.getState().paneForegroundAgentByPaneKey[options.paneKey]
    return entry !== undefined && entry.agent !== null && !entry.shellForeground
  }

  const shouldPreserveModes = (): boolean =>
    hasLiveStatusOrTitle() ||
    hasCommittedAgentTitle() ||
    hasForegroundAgentProcess() ||
    hasCursorAgentSignal

  return {
    rememberPayload: (data, rememberOptions) => {
      signalGeneration += 1
      const signal = hasCursorAgentReattachPayloadScreenSignal(data)
      hasCursorAgentSignal = rememberOptions.fullScreenReplay
        ? signal
        : hasCursorAgentSignal || signal
    },
    getSignalGeneration: () => signalGeneration,
    getHasCursorAgentSignal: () => hasCursorAgentSignal,
    clearCursorAgentSignal: () => {
      hasCursorAgentSignal = false
    },
    hasLiveStatusOrTitle,
    shouldPreserveModes,
    shouldSendFocusIn: () => terminalOwnsDomFocus(options.terminal) && shouldPreserveModes(),
    scheduleIdleCursorReset: () => {
      const status = detectAgentStatusFromTitle(getCurrentTitle() ?? '')
      if (status !== 'idle' && status !== 'permission') {
        return
      }
      dispose()
      idleCursorResetTimer = setTimeout(() => {
        idleCursorResetTimer = null
        if (options.getIsDisposed()) {
          return
        }
        const latest = detectAgentStatusFromTitle(getCurrentTitle() ?? '')
        if (latest === 'idle' || latest === 'permission') {
          options.queueIdleTerminalModeReset()
        }
      }, IDLE_CURSOR_RESET_DELAY_MS)
    },
    dispose
  }
}

import type { Terminal } from '@xterm/xterm'
import { isTerminalQueryReply } from '@yiru/protocol/terminal/query-reply'
import { useAppStore } from '~renderer/store/state'
import { isPtyLocked } from '~renderer/terminal-pane/pane-manager/mobile-driver-state'

import { subscribeToTerminalUserInput } from '../terminal-user-input-signal'
import { isCodexPaneStale } from './codex-restart-staleness'
import type { ShellCommandAgentInference } from './shell-command-agent-inference'
import type { TerminalInputIntent } from './terminal-input-intent'
import { TERMINAL_FOCUS_IN_SEQUENCE, TERMINAL_FOCUS_OUT_SEQUENCE } from './terminal-output-policy'
import type { PtyTransport } from './transport-types'

type TerminalInputOptions = {
  terminal: Terminal
  paneKey: string
  paneId: number
  tabId: string
  worktreeId: string
  transport: PtyTransport
  inputIntent: TerminalInputIntent
  shellInference: ShellCommandAgentInference
  isReplaying: () => boolean
  isNativeWindowsConpty: boolean
  getSuppressIdleCodexFocusReports: () => boolean
  claimViewport: () => void
  sendQueryReply: (data: string) => boolean
  requestRecovery: () => void
  observeInterruptIntent: (intent: 'ctrl-c' | 'plain-escape') => void
  observeTitleOnlyInterrupt: () => void
}

export type TerminalInput = {
  getLastInputAt: () => number
  recordActivity: () => void
  dispose: () => void
}

export function createTerminalInput(options: TerminalInputOptions): TerminalInput {
  let lastInputAt = Number.NEGATIVE_INFINITY
  const recordActivity = (): void => {
    useAppStore.getState().recordTerminalInput(options.paneKey)
  }
  const userActivity = subscribeToTerminalUserInput(options.terminal, recordActivity)
  const recordFallbackActivity = (): void => {
    if (userActivity === null) {
      recordActivity()
    }
  }
  const markAccepted = (): void => {
    lastInputAt = performance.now()
    recordFallbackActivity()
  }

  const onData = options.terminal.onData((data) => {
    if (options.isReplaying()) {
      return
    }
    const currentPtyId = options.transport.getPtyId()
    if (
      isCodexPaneStale({
        tabId: options.tabId,
        worktreeId: options.worktreeId,
        panePtyId: currentPtyId
      })
    ) {
      options.inputIntent.clear()
      return
    }
    if (currentPtyId && isPtyLocked(currentPtyId)) {
      options.inputIntent.clear()
      return
    }
    if (
      options.isNativeWindowsConpty &&
      options.getSuppressIdleCodexFocusReports() &&
      (data === TERMINAL_FOCUS_IN_SEQUENCE || data === TERMINAL_FOCUS_OUT_SEQUENCE)
    ) {
      return
    }
    if (isTerminalQueryReply(data)) {
      options.sendQueryReply(data)
      return
    }
    const intent = options.inputIntent.getPending()
    const acknowledgedIntent = intent ?? options.inputIntent.inferExact(data)
    if (acknowledgedIntent && options.transport.sendInputAccepted) {
      options.claimViewport()
      if (acknowledgedIntent === 'ctrl-c') {
        options.shellInference.cancelSuspended()
      }
      options.inputIntent.clear()
      lastInputAt = performance.now()
      const writePromise = options.transport
        .sendInputAccepted(data)
        .then((accepted) => {
          if (accepted) {
            recordFallbackActivity()
            options.shellInference.observeAcceptedInput(data)
            options.inputIntent.observeAccepted(data, acknowledgedIntent)
            options.observeInterruptIntent(acknowledgedIntent)
            options.observeTitleOnlyInterrupt()
          } else {
            options.requestRecovery()
          }
        })
        .catch((error) => {
          console.warn('[agent-interrupt] acknowledged terminal input failed:', error)
        })
      options.inputIntent.setPendingWrite(writePromise)
      return
    }
    options.claimViewport()
    if (options.transport.sendInput(data)) {
      markAccepted()
      options.shellInference.observeAcceptedInput(data)
      options.inputIntent.observeAccepted(data, intent ?? undefined)
      if (!intent) {
        options.inputIntent.observeSent(data)
      }
    } else {
      options.inputIntent.clear()
      options.requestRecovery()
    }
    if (intent) {
      options.inputIntent.clear()
    }
  })

  return {
    getLastInputAt: () => lastInputAt,
    recordActivity,
    dispose: () => {
      onData.dispose()
      userActivity?.dispose()
    }
  }
}

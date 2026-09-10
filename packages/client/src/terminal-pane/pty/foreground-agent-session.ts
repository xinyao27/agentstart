import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { Terminal } from '@xterm/xterm'
import { inspectRuntimeTerminalProcess } from '~renderer/runtime/terminal-inspection'
import { useAppStore } from '~renderer/store/state'
import { dispatchTerminalCommandFinishedEvent } from '~renderer/terminal/command-finished-event'

import { observeTerminalCommandStarts } from '../emulator/command-lifecycle'
import { createPaneForegroundAgentTracker } from '../pane-foreground-agent-tracker'
import { dropCommandFinishedStatusIfSameTurn } from './command-finished-status'
import type { ShellCommandAgentInference } from './shell-command-agent-inference'
import type { TerminalInputIntent } from './terminal-input-intent'

type AppState = ReturnType<typeof useAppStore.getState>

type ForegroundAgentSessionOptions = {
  terminal: Terminal
  paneKey: string
  worktreeId: string
  getPtyId: () => string | null
  getIsVisible: () => boolean
  shellCommandInference: ShellCommandAgentInference
  terminalInputIntent: TerminalInputIntent
  hasKnownAgentIdentity: () => boolean
  hasLiveHookIcon: (state: AppState) => boolean
  expectsLaunchAgent: (state: AppState) => boolean
  clearStaleTitleOnConfirmedShell: () => void
}

export type ForegroundAgentSession = {
  handleCommandFinished: (exitCode: number | null) => void
  sampleVisible: (forceRoutingConfirmation?: boolean) => void
  onCommandStarted: (agent: TuiAgent | null) => void
  dispose: () => void
}

export function createForegroundAgentSession(
  options: ForegroundAgentSessionOptions
): ForegroundAgentSession {
  let deferredStatusDrop: (() => void) | null = null
  let isVisibleSamplePending = false
  let isVisibleSampleSettled = false
  const settleDeferredStatusDrop = (): void => {
    const drop = deferredStatusDrop
    deferredStatusDrop = null
    drop?.()
  }
  const tracker = createPaneForegroundAgentTracker({
    getPtyId: options.getPtyId,
    isTrackablePtyId: () => true,
    readForegroundProcess: (id) =>
      inspectRuntimeTerminalProcess(useAppStore.getState().settings, id).then(
        (process) => process.foregroundProcess
      ),
    confirmForegroundProcess: (id) =>
      inspectRuntimeTerminalProcess(useAppStore.getState().settings, id).then(
        (process) => process.foregroundProcess
      ),
    publish: (entry) => useAppStore.getState().setPaneForegroundAgent(options.paneKey, entry),
    hasKnownAgentIdentity: options.hasKnownAgentIdentity,
    onConfirmedShellForeground: (reason) => {
      options.clearStaleTitleOnConfirmedShell()
      if (reason === 'visible-pty') {
        useAppStore.getState().clearAgentLaunchConfig(options.paneKey)
      } else {
        settleDeferredStatusDrop()
      }
    },
    onCommandFinishedUnavailable: settleDeferredStatusDrop,
    onVisibleForegroundSettled: (outcome) => {
      isVisibleSamplePending = false
      isVisibleSampleSettled = outcome !== 'inconclusive'
    }
  })

  const handleCommandFinished = (_exitCode: number | null): void => {
    options.shellCommandInference.clearAfterPtySideEffects()
    isVisibleSamplePending = false
    const shouldDeferStatusDrop = tracker.onCommandFinished()
    dispatchTerminalCommandFinishedEvent(options.worktreeId)
    const entry = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
    const inference = options.terminalInputIntent.flushPendingInference()
    const dropStatus = (): void => {
      if (inference === true) {
        dropCommandFinishedStatusIfSameTurn(options.paneKey, entry, {
          allowInferredInterrupt: true
        })
      } else if (inference instanceof Promise) {
        void inference.then((applied) => {
          dropCommandFinishedStatusIfSameTurn(options.paneKey, entry, {
            allowInferredInterrupt: applied === true
          })
        })
      } else {
        dropCommandFinishedStatusIfSameTurn(options.paneKey, entry)
      }
    }
    if (shouldDeferStatusDrop) {
      deferredStatusDrop = dropStatus
    } else {
      deferredStatusDrop = null
      dropStatus()
    }
  }

  const sampleVisible = (forceRoutingConfirmation = false): void => {
    if (!options.getIsVisible() || isVisibleSamplePending || isVisibleSampleSettled) {
      return
    }
    const state = useAppStore.getState()
    const foreground = state.paneForegroundAgentByPaneKey[options.paneKey]
    if (
      (foreground?.agent && foreground.routingTrusted === true) ||
      (!forceRoutingConfirmation && options.hasLiveHookIcon(state)) ||
      foreground?.shellForeground
    ) {
      return
    }
    isVisibleSamplePending = tracker.onVisiblePtyBound(options.expectsLaunchAgent(state))
  }

  options.shellCommandInference.setAcceptedAgentHandler(tracker.onCommandStarted)
  options.shellCommandInference.setDroidReconfirmationHandler(() => {
    const foreground = useAppStore.getState().paneForegroundAgentByPaneKey[options.paneKey]
    if (foreground?.agent !== 'droid') {
      return
    }
    useAppStore.getState().setPaneForegroundAgent(options.paneKey, {
      agent: 'droid',
      shellForeground: false
    })
    isVisibleSamplePending = false
    isVisibleSampleSettled = false
    sampleVisible(true)
  })
  const commandLifecycle = observeTerminalCommandStarts(options.terminal, () => {
    deferredStatusDrop = null
    isVisibleSamplePending = false
    isVisibleSampleSettled = false
    tracker.onCommandStarted(options.shellCommandInference.getAgent())
  })

  return {
    handleCommandFinished,
    sampleVisible,
    onCommandStarted: tracker.onCommandStarted,
    dispose: () => {
      commandLifecycle.dispose()
      deferredStatusDrop = null
      isVisibleSamplePending = false
      isVisibleSampleSettled = false
      tracker.dispose()
    }
  }
}

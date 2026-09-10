import type { AgentType } from '@agentstart/protocol/agent/status-records'
import { makePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import { useAppStore } from '~renderer/store/state'
import { resolveCommittedTitleAgentType } from '~renderer/terminal-pane/agent/evidence'
import { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'
import type { PaneManager, ManagedPane } from '~renderer/terminal-pane/pane-manager/pane-manager'
import { writeTerminalOutput } from '~renderer/terminal-pane/pane-manager/pane-terminal-output-scheduler'
import { createTerminalStructuralReplayCoordinator } from '~renderer/terminal-pane/pane-manager/terminal-structural-replay-coordinator'

import { RESET_TERMINAL_CURSOR_STYLE } from '../layout-serialization'
import {
  captureTerminalPaneRecoveryGeneration,
  registerTerminalPaneRecoveryInstance
} from '../recovery'
import { isPaneReplaying } from '../replay-guard'
import { createAgentPaneSession } from './agent-pane-session'
import { createConnectionExit } from './connection-exit'
import { createConnectionLifecycle, type PanePtyBinding } from './connection-lifecycle'
import { createConnectionStart, type ConnectionStart } from './connection-start'
import { createConnectionTransport } from './connection-transport'
import type { PtyConnectionDeps } from './connection-types'
import { createGeometrySession } from './geometry-session'
import { createReplayWriter } from './replay-writer'
import { createSessionReconciler } from './session-reconciler'
import { resolveSleepingAgentRecordForPane } from './sleeping-agent-record'
import { createStartupConnectGate } from './startup-connect-gate'
import { createStartupLaunch } from './startup-launch'
import { createTerminalInput } from './terminal-input'
import { shouldWritePtyOutputForeground } from './terminal-output-policy'

/**
 * Establishes a binding between a terminal pane and its corresponding PTY stream,
 * managing input, output, title synchronization, and agent status tracking.
 */
export function connectPanePty(
  pane: ManagedPane,
  manager: PaneManager,
  deps: PtyConnectionDeps
): PanePtyBinding {
  const shouldRefreshForegroundSynchronously = (): boolean => !manager.hasWebglRenderer(pane.id)
  // Why: recovery ownership belongs to this xterm instance. A request that
  // settles after remount must not remount its already-replaced successor.
  const terminalRecoveryGeneration = captureTerminalPaneRecoveryGeneration(deps.tabId)
  const terminalRecoveryInstance = registerTerminalPaneRecoveryInstance(deps.tabId)
  let disposed = false
  const structuralReplayCoordinator = createTerminalStructuralReplayCoordinator(pane.terminal)
  const replayWriter = createReplayWriter({
    pane,
    replayingPanesRef: deps.replayingPanesRef,
    restoredViewportBlankingPanesRef: deps.restoredViewportBlankingPanesRef,
    shouldRefreshViewportSynchronously: shouldRefreshForegroundSynchronously
  })
  let connectionStart: ConnectionStart | null = null
  // Why: idle callbacks are registered before the deferred PTY output plumbing
  // exists. Start with the shared scheduler, then switch to the PTY writer
  // below so hidden-tab resets keep backlog-recovery callbacks and byte order.
  let idleAgentTerminalModeReset = RESET_TERMINAL_CURSOR_STYLE
  let suppressNativeWindowsIdleCodexFocusReports = false
  const setFocusReportSuppressionForAgentCompletion = (
    title: string | undefined,
    agentType: AgentType | undefined
  ): void => {
    const titleAgentType = resolveCommittedTitleAgentType(title ?? '')
    suppressNativeWindowsIdleCodexFocusReports =
      agentType && agentType !== 'unknown' ? agentType === 'codex' : titleAgentType === 'codex'
  }
  let queueAgentIdleTerminalModeReset = (): void => {
    if (disposed) {
      return
    }
    if (connectionStart?.writeIdleModeReset(idleAgentTerminalModeReset)) {
      return
    }
    writeTerminalOutput(pane.terminal, idleAgentTerminalModeReset, {
      foreground: shouldWritePtyOutputForeground(deps.isVisibleRef.current)
    })
  }
  // Why: passphrase-gate waits register a teardown here so dispose() can
  // actively unsubscribe + resolve them. Without this, a pane disposed
  // mid-wait leaks its zustand subscriber and the surrounding async IIFE
  // forever, since the subscriber's `disposed` check only fires when the
  // store next emits — which may never happen after disconnect.
  const waitTeardowns: (() => void)[] = []
  // Why: startup commands must only run once — in the pane they were
  // targeted at. Capture `deps.startup` into a local and clear the field on
  // the (already spread-copied) `deps` so nothing else inside this function
  // can accidentally re-read it. The caller is responsible for clearing its
  // own outer reference, since `deps` here is a shallow copy and our
  // mutation does not propagate back.
  const paneStartup = deps.startup ?? null
  deps.startup = undefined

  // Why: paneKey crosses PTY env, hook IPC, retained rows, and reload/replay.
  // Use the stable layout leaf UUID, not the renderer-local numeric pane id.
  const cacheKey = makePaneKey(deps.tabId, pane.leafId)
  // Why: mirrors the kitty keyboard flags the pane's application negotiates.
  // Fed only from application output (live PTY bytes + daemon replay
  // payloads), never from renderer-generated resets, so it reflects what the
  // application expects even after defensive renderer-side kitty wipes.
  const kittyKeyboardModes = (() => {
    const existing = deps.paneKittyKeyboardModesRef.current.get(pane.id)
    if (existing) {
      return existing
    }
    const created = new TerminalKittyKeyboardModeTracker()
    deps.paneKittyKeyboardModesRef.current.set(pane.id, created)
    return created
  })()
  const getSleepingRecordForPane = (state: ReturnType<typeof useAppStore.getState>) =>
    resolveSleepingAgentRecordForPane(state, {
      paneKey: cacheKey,
      numericPaneId: pane.id,
      tabId: deps.tabId,
      worktreeId: deps.worktreeId
    })
  const startupLaunch = createStartupLaunch({
    startup: paneStartup,
    paneKey: cacheKey,
    tabId: deps.tabId,
    leafId: pane.leafId,
    worktreeId: deps.worktreeId
  })
  const agentPaneSession = createAgentPaneSession({
    pane,
    manager,
    deps,
    paneKey: cacheKey,
    startup: paneStartup,
    launch: startupLaunch,
    getTransport: () => transport,
    getIsDisposed: () => disposed,
    setFocusReportSuppression: setFocusReportSuppressionForAgentCompletion,
    clearFocusReportSuppression: () => {
      suppressNativeWindowsIdleCodexFocusReports = false
    },
    queueIdleModeReset: () => queueAgentIdleTerminalModeReset(),
    handleMode2031Subscribe: () => transportIo.handleMode2031Subscribe()
  })
  const shellCommandInference = agentPaneSession.shellCommandInference
  const terminalInputIntent = agentPaneSession.terminalInputIntent
  const reattachAgentSignal = agentPaneSession.reattachAgentSignal
  const paneBinding = agentPaneSession.paneBinding
  const bindActivePanePty = agentPaneSession.bindActivePanePty
  const dropSideEffectFactConsumer = paneBinding.dropFacts
  const clearPanePtyFitBinding = paneBinding.clear

  const connectionExit = createConnectionExit({
    pane,
    manager,
    deps,
    paneKey: cacheKey,
    paneBinding,
    writer: replayWriter,
    kittyKeyboardModes,
    getTransport: () => transport,
    getIsDisposed: () => disposed,
    getSleepingRecord: () => getSleepingRecordForPane(useAppStore.getState())?.record ?? null,
    getHadExistingPaneTransport: () => hadExistingPaneTransportAtConnect,
    getRestoredPtyId: () => restoredPtyIdForTransport,
    getLastInputAt: () => terminalInput.getLastInputAt(),
    getHasReceivedOutput: () => hasReceivedPtyOutput,
    resetOutputSequence: (ptyId) => connectionStart?.resetOutputSequenceForExit(ptyId),
    disposeProcessTracking: agentPaneSession.disposeProcessTracking,
    bindActivePanePty
  })
  const hibernatedAgentWake = connectionExit.hibernatedAgentWake
  const exitSession = connectionExit.exitSession
  const onExit = exitSession.onExit
  const onPtySpawn = connectionExit.onPtySpawn
  let hasReceivedPtyOutput = false
  const {
    transport,
    transportIo,
    connectionId,
    isNativeWindowsConpty,
    runtimeEnvironmentId,
    restoredPtyId: restoredPtyIdForTransport,
    resumePlatform,
    paneIdentityEnv,
    shouldDeliverStartupViaTerminalPaste,
    hadExistingPaneTransportAtConnect,
    shouldApplyWindowsRendererUnicodeRefresh,
    disposeWindowsModeReset
  } = createConnectionTransport({
    pane,
    deps,
    paneKey: cacheKey,
    startup: paneStartup,
    launch: startupLaunch,
    recoveryGeneration: terminalRecoveryGeneration,
    recoveryInstanceId: terminalRecoveryInstance.id,
    getIsDisposed: () => disposed,
    onPtyExit: onExit,
    onPtySpawn,
    onAgentStatus: agentPaneSession.onAgentStatus,
    setIdleModeReset: (data) => {
      idleAgentTerminalModeReset = data
    },
    setFocusReportSuppression: setFocusReportSuppressionForAgentCompletion,
    clearFocusReportSuppression: () => {
      suppressNativeWindowsIdleCodexFocusReports = false
    },
    queueIdleModeReset: () => queueAgentIdleTerminalModeReset()
  })
  const sendDesktopQueryReplyImmediate = transportIo.sendImmediate

  const terminalInput = createTerminalInput({
    terminal: pane.terminal,
    paneKey: cacheKey,
    paneId: pane.id,
    tabId: deps.tabId,
    worktreeId: deps.worktreeId,
    transport,
    inputIntent: terminalInputIntent,
    shellInference: shellCommandInference,
    isReplaying: () => isPaneReplaying(deps.replayingPanesRef, pane.id),
    isNativeWindowsConpty,
    getSuppressIdleCodexFocusReports: () => suppressNativeWindowsIdleCodexFocusReports,
    claimViewport: transportIo.claimViewport,
    sendQueryReply: sendDesktopQueryReplyImmediate,
    requestRecovery: transportIo.requestRecovery,
    observeInterruptIntent: agentPaneSession.observeInterruptIntent,
    observeTitleOnlyInterrupt: agentPaneSession.observeTitleOnlyInterrupt
  })

  const geometrySession = createGeometrySession({
    pane,
    transport,
    getIsDisposed: () => disposed,
    getIsVisible: () => deps.isVisibleRef.current
  })

  connectionStart = createConnectionStart({
    pane,
    manager,
    deps,
    paneKey: cacheKey,
    startup: paneStartup,
    connectionId,
    resumePlatform,
    isNativeWindowsConpty,
    useTerminalPaste: shouldDeliverStartupViaTerminalPaste,
    paneIdentityEnv,
    hadExistingPaneTransport: hadExistingPaneTransportAtConnect,
    terminalRecoveryGeneration,
    terminalRecoveryInstanceId: terminalRecoveryInstance.id,
    transport,
    transportIo,
    terminalInput,
    geometry: geometrySession,
    writer: replayWriter,
    structuralCoordinator: structuralReplayCoordinator,
    agentSignal: reattachAgentSignal,
    kittyKeyboardModes,
    paneBinding,
    launch: startupLaunch,
    hibernatedAgentWake,
    getIsDisposed: () => disposed,
    getSleepingRecord: getSleepingRecordForPane,
    bindActivePanePty,
    observeOutputActivity: () => {
      hasReceivedPtyOutput = true
      agentPaneSession.observeOutputActivity()
    },
    shouldRefreshForegroundSynchronously,
    applyWindowsUnicodeRefresh: shouldApplyWindowsRendererUnicodeRefresh,
    applyNativeWindowsRewriteRefresh: isNativeWindowsConpty,
    protectNativeWindowsSynchronizedOutput: isNativeWindowsConpty
  })

  const startupConnectGate = createStartupConnectGate({
    pane,
    manager,
    setupSplitDirection: paneStartup?.waitForSetupSplitDirection,
    shouldSettleGrid:
      Boolean(paneStartup?.command) &&
      deps.isVisibleRef.current &&
      !connectionId &&
      runtimeEnvironmentId === null,
    isAlive: () => !disposed,
    onConnect: connectionStart.start
  })
  startupConnectGate.start()

  const sessionReconciler = createSessionReconciler({
    transport,
    exitSession,
    paneBinding,
    getIsDisposed: () => disposed
  })

  return createConnectionLifecycle({
    pane,
    setDisposed: () => {
      disposed = true
    },
    unregisterRecovery: terminalRecoveryInstance.unregister,
    transportIo,
    connectionStart,
    structuralCoordinator: structuralReplayCoordinator,
    startupConnectGate,
    geometry: geometrySession,
    agentPaneSession,
    waitTeardowns,
    startupLaunch,
    dropSideEffectFacts: dropSideEffectFactConsumer,
    clearPaneBinding: clearPanePtyFitBinding,
    disposeWindowsModeReset,
    terminalInput,
    hibernatedAgentWake,
    sessionReconciler
  })
}

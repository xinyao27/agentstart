import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'
import type { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'

import { recordAgentHibernationPaneOutput } from '../agent/hibernation-output-activity'
import type { ManagedPane } from '../pane-manager/pane-manager'
import {
  discardTerminalOutput,
  registerTerminalBacklogRecovery
} from '../pane-manager/pane-terminal-output-scheduler'
import type { TerminalStructuralReplayCoordinator } from '../pane-manager/terminal-structural-replay-coordinator'
import { registerStaleDocumentVisibilityRecovery } from '../stale-document-visibility'
import type { PtyConnectionDeps } from './connection-types'
import type { GeometrySession } from './geometry-session'
import { setupHiddenOutputRestore } from './hidden-output-restore-setup'
import { createHiddenRendererQuery } from './hidden-renderer-query'
import { shouldKeepHiddenStartupRendererQueriesLive } from './hidden-startup-renderer-queries'
import { createOrderedOutputSequence } from './ordered-output-sequence'
import { deliverPtyOutput } from './output-delivery'
import { createOutputWriter } from './output-writer'
import type { ReattachAgentSignal } from './reattach-agent-signal'
import type { ReattachOutput } from './reattach-output'
import type { ReplayWriter } from './replay-writer'
import type { StartupSession } from './startup-session'
import { shouldWritePtyOutputForeground } from './terminal-output-policy'
import type { TransportIo } from './transport-io'
import type { PtyTransport } from './transport-types'

type OutputSessionOptions = {
  pane: ManagedPane
  paneKey: string
  tabId: string
  worktreeId: string
  startup: PtyConnectionDeps['startup']
  paneMode2031Ref: PtyConnectionDeps['paneMode2031Ref']
  paneLastThemeModeRef: PtyConnectionDeps['paneLastThemeModeRef']
  transport: PtyTransport
  transportIo: TransportIo
  geometry: GeometrySession
  writer: ReplayWriter
  reattachOutput: ReattachOutput
  reattachAgentSignal: ReattachAgentSignal
  structuralCoordinator: TerminalStructuralReplayCoordinator
  startupSession: StartupSession
  kittyKeyboardModes: TerminalKittyKeyboardModeTracker
  terminalRecoveryGeneration: number
  terminalRecoveryInstanceId: number
  getIsDisposed: () => boolean
  getIsVisible: () => boolean
  getIsActiveSplitPane: () => boolean
  getLastInputAt: () => number
  observeOutputActivity: () => void
  shouldRefreshForegroundSynchronously: () => boolean
  applyWindowsUnicodeRefresh: boolean
  applyNativeWindowsRewriteRefresh: boolean
  protectNativeWindowsSynchronizedOutput: boolean
}

export type OutputSession = {
  write: (data: string, foreground: boolean) => void
  clearBeforeSpawn: () => void
  resetSequenceForExit: (ptyId: string) => void
  dispose: () => void
}

export function createOutputSession(options: OutputSessionOptions): OutputSession {
  const shouldSnapshotHiddenOutput = shouldKeepHiddenStartupRendererQueriesLive(options.startup)
  const outputWriter = createOutputWriter({
    pane: options.pane,
    transport: options.transport,
    kittyKeyboardModes: options.kittyKeyboardModes,
    geometry: options.geometry,
    shouldSnapshotHiddenOutput,
    getLastInputAt: options.getLastInputAt,
    getIsActiveSplitPane: options.getIsActiveSplitPane,
    getIsForeground: () => shouldWritePtyOutputForeground(options.getIsVisible()),
    getIsDisposed: options.getIsDisposed,
    shouldRefreshForegroundSynchronously: options.shouldRefreshForegroundSynchronously,
    applyWindowsUnicodeRefresh: options.applyWindowsUnicodeRefresh,
    applyNativeWindowsRewriteRefresh: options.applyNativeWindowsRewriteRefresh,
    protectNativeWindowsSynchronizedOutput: options.protectNativeWindowsSynchronizedOutput
  })
  const orderedOutput = createOrderedOutputSequence({ getPtyId: options.transport.getPtyId })
  const query = createHiddenRendererQuery({
    terminal: options.pane.terminal,
    paneId: options.pane.id,
    paneMode2031Ref: options.paneMode2031Ref,
    paneLastThemeModeRef: options.paneLastThemeModeRef,
    sendImmediate: options.transportIo.sendImmediate,
    writeStatelessQueryData: (data) =>
      outputWriter.write(data, false, { hiddenStartupRendererQuery: true }),
    writeUnansweredQueryData: (data) =>
      outputWriter.write(data, true, { hiddenStartupRendererQuery: true })
  })
  outputWriter.setQuery(query)
  const hiddenRestore = setupHiddenOutputRestore({
    pane: options.pane,
    coordinator: options.structuralCoordinator,
    query,
    orderedOutput,
    shouldSnapshotHiddenOutput,
    transport: options.transport,
    tabId: options.tabId,
    worktreeId: options.worktreeId,
    terminalRecoveryGeneration: options.terminalRecoveryGeneration,
    terminalRecoveryInstanceId: options.terminalRecoveryInstanceId,
    getIsDisposed: options.getIsDisposed,
    getIsForeground: () => shouldWritePtyOutputForeground(options.getIsVisible()),
    getIsActive: options.getIsActiveSplitPane,
    writeForeground: (data) => outputWriter.write(data, true),
    writeReplayData: options.writer.write,
    hasLiveAgent: options.reattachAgentSignal.hasLiveStatusOrTitle,
    isRendererPtyResizeAuthoritative: options.geometry.isRendererResizeAuthoritative,
    setSuppressPtyResize: options.geometry.setSnapshotReplayResizeSuppressed,
    resetHiddenRendererRisk: outputWriter.resetHiddenRisk,
    resetSkippedRendererRisk: outputWriter.resetSkippedHiddenRisk,
    onRestoreSettled: options.reattachAgentSignal.scheduleIdleCursorReset,
    beforeTerminalWrite: outputWriter.beforeWrite,
    discardTerminalOutput: () => discardTerminalOutput(options.pane.terminal)
  })
  outputWriter.setHiddenRestore(hiddenRestore)
  options.reattachOutput.setCancelSnapshotReplay(hiddenRestore.cancelSnapshotReplay)
  const unregisterBacklog = registerTerminalBacklogRecovery(
    options.pane.terminal,
    hiddenRestore.request
  )
  let unregisterVisibility: (() => void) | null = null
  if (
    typeof document !== 'undefined' &&
    typeof document.addEventListener === 'function' &&
    typeof document.removeEventListener === 'function'
  ) {
    const onVisibilityChange = (): void => {
      if (shouldWritePtyOutputForeground(options.getIsVisible())) {
        // Why: a focused macOS window can keep a stale hidden delivery gate
        // after occlusion recovery. Reasserting the visible stream before the
        // snapshot request restores output credit, including local input echo.
        options.transport.setDeliveryState?.({
          visible: true,
          interested: true,
          priority: options.getIsActiveSplitPane() ? 'active' : 'visible'
        })
        hiddenRestore.request()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    const unregisterStaleVisibility = registerStaleDocumentVisibilityRecovery(onVisibilityChange)
    unregisterVisibility = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unregisterStaleVisibility()
    }
  }
  const outputDelivery = (data: string, meta?: PtyDataMeta): void => {
    deliverPtyOutput(
      {
        terminal: options.pane.terminal,
        query,
        orderedOutput,
        hiddenRestore: {
          resetIfPtyChanged: hiddenRestore.resetIfPtyChanged,
          isForegroundBackpressure: hiddenRestore.isForegroundBackpressure,
          noteFloodBackpressure: hiddenRestore.noteFloodBackpressure,
          markNeeded: hiddenRestore.markNeeded,
          getState: hiddenRestore.getState,
          markFreshSnapshotNeeded: hiddenRestore.markFreshSnapshotNeeded,
          shouldSkipRendererOutput: hiddenRestore.shouldSkipRendererOutput,
          skipRendererOutput: hiddenRestore.skipRendererOutput,
          skipBackgroundAlternateScreenOutput: outputWriter.skipBackgroundAlternateScreenOutput,
          queueLiveChunk: hiddenRestore.queueLiveChunk,
          request: hiddenRestore.request,
          resetSkippedRendererRisk: outputWriter.resetSkippedHiddenRisk
        },
        getPaneIsForeground: () => shouldWritePtyOutputForeground(options.getIsVisible()),
        observeActivity: () => {
          recordAgentHibernationPaneOutput(options.paneKey)
          options.observeOutputActivity()
        },
        filterStartupOutput: options.startupSession.commandDelivery.observeOutput,
        observeStartupDraft: options.startupSession.draftPaste.observe,
        respondToPixelSizeQueries: options.transportIo.respondToPixelSizeQueries,
        sendImmediate: options.transportIo.sendImmediate,
        write: outputWriter.write,
        scheduleStartupCommand: options.startupSession.commandDelivery.schedule
      },
      data,
      meta
    )
  }
  options.reattachOutput.setOutputDelivery(outputDelivery)

  return {
    write: outputWriter.write,
    clearBeforeSpawn: () => {
      query.clearModeState()
      hiddenRestore.clear()
    },
    resetSequenceForExit: orderedOutput.resetForExit,
    dispose: () => {
      hiddenRestore.dispose()
      unregisterBacklog()
      unregisterVisibility?.()
      outputWriter.dispose()
    }
  }
}

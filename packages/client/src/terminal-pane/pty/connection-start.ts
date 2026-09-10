import { scheduleRuntimeGraphSync } from '~renderer/runtime/sync-runtime-graph'
import { useAppStore } from '~renderer/store/state'
import type { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'
import { createTerminalZeroDimensionsMessage } from '~renderer/terminal/zero-dimensions-diagnostic'

import type { ManagedPane, PaneManager } from '../pane-manager/pane-manager'
import {
  waitForTerminalOutputParsed,
  writeTerminalOutput
} from '../pane-manager/pane-terminal-output-scheduler'
import { safeFit } from '../pane-manager/pane-tree-ops'
import type { TerminalStructuralReplayCoordinator } from '../pane-manager/terminal-structural-replay-coordinator'
import type { ActivePaneBindingOptionsOverride } from './active-pane-binding'
import type { PtyConnectionDeps } from './connection-types'
import { createFreshSpawn } from './fresh-spawn'
import { createFreshSpawnFollow } from './fresh-spawn-follow'
import type { GeometrySession } from './geometry-session'
import type { HibernatedAgentWake } from './hibernated-agent-wake'
import { createOutputSession, type OutputSession } from './output-session'
import type { PaneBinding } from './pane-binding'
import type { ReattachAgentSignal } from './reattach-agent-signal'
import { createReattachOutput, type ReattachOutput } from './reattach-output'
import type { ReplayWriter } from './replay-writer'
import { startPtySession } from './session-start'
import type { SleepingAgentRecordEntry } from './sleeping-agent-record'
import type { StartupLaunch } from './startup-launch'
import { createStartupSession, type StartupSession } from './startup-session'
import type { TerminalInput } from './terminal-input'
import { shouldWritePtyOutputForeground } from './terminal-output-policy'
import type { TransportIo } from './transport-io'
import type { PtyTransport } from './transport-types'

const STARTUP_CWD_FALLBACK_NOTICE =
  '\r\n[AgentStart opened this terminal at the workspace root because its saved start folder no longer exists.]\r\n'

type ConnectionStartOptions = {
  pane: ManagedPane
  manager: PaneManager
  deps: PtyConnectionDeps
  paneKey: string
  startup: PtyConnectionDeps['startup']
  connectionId: string | null
  resumePlatform: NodeJS.Platform
  isNativeWindowsConpty: boolean
  useTerminalPaste: boolean
  paneIdentityEnv: Record<string, string>
  hadExistingPaneTransport: boolean
  terminalRecoveryGeneration: number
  terminalRecoveryInstanceId: number
  transport: PtyTransport
  transportIo: TransportIo
  terminalInput: TerminalInput
  geometry: GeometrySession
  writer: ReplayWriter
  structuralCoordinator: TerminalStructuralReplayCoordinator
  agentSignal: ReattachAgentSignal
  kittyKeyboardModes: TerminalKittyKeyboardModeTracker
  paneBinding: PaneBinding
  launch: StartupLaunch
  hibernatedAgentWake: HibernatedAgentWake
  getIsDisposed: () => boolean
  getSleepingRecord: (
    state: ReturnType<typeof useAppStore.getState>
  ) => SleepingAgentRecordEntry | null
  bindActivePanePty: (ptyId: string, options?: ActivePaneBindingOptionsOverride) => void
  observeOutputActivity: () => void
  shouldRefreshForegroundSynchronously: () => boolean
  applyWindowsUnicodeRefresh: boolean
  applyNativeWindowsRewriteRefresh: boolean
  protectNativeWindowsSynchronizedOutput: boolean
}

export type ConnectionStart = {
  start: () => void
  writeIdleModeReset: (data: string) => boolean
  resetOutputSequenceForExit: (ptyId: string) => void
  disposeReattachOutput: () => void
  cancelFreshSpawnFollow: () => void
  disposeStartupSession: () => void
  disposeOutputSession: () => void
}

export function createConnectionStart(options: ConnectionStartOptions): ConnectionStart {
  let startupSession: StartupSession | null = null
  let reattachOutput: ReattachOutput | null = null
  let outputSession: OutputSession | null = null
  let cancelFreshSpawnFollow = (): void => {}

  const start = (): void => {
    if (options.getIsDisposed()) {
      return
    }
    safeFit(options.pane)
    const cols = options.pane.terminal.cols
    const rows = options.pane.terminal.rows
    if ((cols === 0 || rows === 0) && options.deps.isVisibleRef.current) {
      options.deps.onPtyErrorRef?.current?.(
        options.pane.id,
        createTerminalZeroDimensionsMessage(cols, rows)
      )
    }
    const reportError = (message: string): void => {
      if (!options.getIsDisposed()) {
        options.deps.onPtyErrorRef?.current?.(options.pane.id, message)
      }
    }
    let sessionRestoredBannerShown = false
    const showSessionRestoredBanner = (): void => {
      if (!sessionRestoredBannerShown) {
        sessionRestoredBannerShown = true
        options.deps.onShowSessionRestoredBanner(options.pane.id)
      }
    }
    const currentStartupSession = createStartupSession({
      pane: options.pane,
      paneKey: options.paneKey,
      tabId: options.deps.tabId,
      worktreeId: options.deps.worktreeId,
      startup: options.startup,
      launch: options.launch,
      transport: options.transport,
      connectionId: options.connectionId,
      isNativeWindowsConpty: options.isNativeWindowsConpty,
      useTerminalPaste: options.useTerminalPaste,
      getIsDisposed: options.getIsDisposed,
      getIsCurrentTransport: () =>
        options.deps.paneTransportsRef.current.get(options.pane.id) === options.transport,
      getResumePlatform: () => options.resumePlatform,
      getSleepingRecord: options.getSleepingRecord,
      waitForOutputParsed: () => waitForTerminalOutputParsed(options.pane.terminal),
      recordInput: options.terminalInput.recordActivity,
      showSessionRestored: showSessionRestoredBanner
    })
    startupSession = currentStartupSession
    const currentReattachOutput = createReattachOutput({
      pane: options.pane,
      transport: options.transport,
      writer: options.writer,
      structuralCoordinator: options.structuralCoordinator,
      agentSignal: options.agentSignal,
      kittyKeyboardModes: options.kittyKeyboardModes,
      getIsDisposed: options.getIsDisposed,
      waitForOutputParsed: () => waitForTerminalOutputParsed(options.pane.terminal),
      rebuildWebgl: () => options.manager.rebuildPaneWebgl(options.pane.id)
    })
    reattachOutput = currentReattachOutput
    const freshSpawnFollow = createFreshSpawnFollow(options.pane, options.getIsDisposed)
    cancelFreshSpawnFollow = freshSpawnFollow.dispose
    const startFreshSpawn = createFreshSpawn({
      paneKey: options.paneKey,
      cols,
      rows,
      connectionId: options.connectionId,
      paneIdentityEnv: options.paneIdentityEnv,
      transport: options.transport,
      getStreamGeneration: currentReattachOutput.getStreamGeneration,
      captureOutputCallbacks: () => currentReattachOutput.captureCallbacks(reportError),
      setConnectStartedAt: options.transportIo.setConnectStartedAt,
      resetBeforeSpawn: (spawnOptions) => {
        outputSession?.clearBeforeSpawn()
        freshSpawnFollow.reset()
        options.kittyKeyboardModes.reset()
        options.writer.prepareFreshShellViewport(spawnOptions.forceBlankRestoredViewport === true)
      },
      setSshStartupCommand: (command) =>
        currentStartupSession.commandDelivery.setPending({ command }),
      registerLaunchConfig: options.launch.registerEffectiveConfig,
      clearLaunchConfig: options.launch.clearConfig,
      hasConfiguredLaunch: () => Boolean(options.startup?.launchConfig),
      showStartupCwdFallback: () => {
        writeTerminalOutput(options.pane.terminal, STARTUP_CWD_FALLBACK_NOTICE, {
          foreground: shouldWritePtyOutputForeground(options.deps.isVisibleRef.current)
        })
      },
      showSessionRestored: showSessionRestoredBanner,
      clearSleepingRecord: currentStartupSession.coldRestore.clearSleepingRecordAfterSpawn,
      getActivePtyBinding: options.paneBinding.getPtyId,
      bindReattachedPty: (ptyId) =>
        options.bindActivePanePty(ptyId, {
          updateTabPtyId: 'if-missing',
          sampleVisibleForegroundAgent: true
        }),
      reconcileSize: options.geometry.reconcileAfterSpawn,
      scheduleSshStartupCommand: currentStartupSession.commandDelivery.schedule
    })
    currentStartupSession.setFreshSpawn(startFreshSpawn)
    options.hibernatedAgentWake.setWake(currentStartupSession.startColdRestore)
    const currentOutputSession = createOutputSession({
      pane: options.pane,
      paneKey: options.paneKey,
      tabId: options.deps.tabId,
      worktreeId: options.deps.worktreeId,
      startup: options.startup,
      paneMode2031Ref: options.deps.paneMode2031Ref,
      paneLastThemeModeRef: options.deps.paneLastThemeModeRef,
      transport: options.transport,
      transportIo: options.transportIo,
      geometry: options.geometry,
      writer: options.writer,
      reattachOutput: currentReattachOutput,
      reattachAgentSignal: options.agentSignal,
      structuralCoordinator: options.structuralCoordinator,
      startupSession: currentStartupSession,
      kittyKeyboardModes: options.kittyKeyboardModes,
      terminalRecoveryGeneration: options.terminalRecoveryGeneration,
      terminalRecoveryInstanceId: options.terminalRecoveryInstanceId,
      getIsDisposed: options.getIsDisposed,
      getIsVisible: () => options.deps.isVisibleRef.current,
      getIsActiveSplitPane: () =>
        options.deps.isActiveRef.current &&
        (options.manager.getActivePane()?.id ?? options.pane.id) === options.pane.id,
      getLastInputAt: options.terminalInput.getLastInputAt,
      observeOutputActivity: options.observeOutputActivity,
      shouldRefreshForegroundSynchronously: options.shouldRefreshForegroundSynchronously,
      applyWindowsUnicodeRefresh: options.applyWindowsUnicodeRefresh,
      applyNativeWindowsRewriteRefresh: options.applyNativeWindowsRewriteRefresh,
      protectNativeWindowsSynchronizedOutput: options.protectNativeWindowsSynchronizedOutput
    })
    outputSession = currentOutputSession
    const restoredPtyId =
      options.deps.restoredLeafId && options.deps.restoredPtyIdByLeafId
        ? (options.deps.restoredPtyIdByLeafId[options.deps.restoredLeafId] ?? null)
        : null
    const storeSnapshot = useAppStore.getState()
    const existingPtyId = storeSnapshot.tabsByWorktree[options.deps.worktreeId]?.find(
      (tab) => tab.id === options.deps.tabId
    )?.ptyId
    const hasSleepingAgent = Boolean(options.getSleepingRecord(storeSnapshot))
    startPtySession({
      paneKey: options.paneKey,
      tabId: options.deps.tabId,
      restoredPtyId,
      existingPtyId: existingPtyId ?? null,
      hasSleepingAgent,
      hadExistingPaneTransport: options.hadExistingPaneTransport,
      currentTabLivePtyIds: storeSnapshot.ptyIdsByTabId[options.deps.tabId] ?? [],
      coldRestoreStartup:
        restoredPtyId && hasSleepingAgent ? currentStartupSession.coldRestore.build() : null,
      transport: options.transport,
      cols,
      rows,
      getIsDisposed: options.getIsDisposed,
      resetBeforeAttach: currentOutputSession.clearBeforeSpawn,
      captureOutputCallbacks: () => currentReattachOutput.captureCallbacks(reportError).callbacks,
      bindAttachedPty: (ptyId) =>
        options.bindActivePanePty(ptyId, {
          updateTabPtyId: 'if-missing',
          sampleVisibleForegroundAgent: true
        }),
      reportError,
      clearTabPtyId: (ptyId) => options.deps.clearTabPtyId(options.deps.tabId, ptyId),
      clearSleepingLayoutBinding: (ptyId) => {
        options.deps.syncPanePtyLayoutBinding(options.pane.id, null)
        options.deps.clearTabPtyId(options.deps.tabId, ptyId)
      },
      startFresh: startFreshSpawn,
      startColdRestore: currentStartupSession.startColdRestore
    })
    scheduleRuntimeGraphSync()
  }

  return {
    start,
    writeIdleModeReset: (data) => {
      if (!outputSession) {
        return false
      }
      outputSession.write(data, shouldWritePtyOutputForeground(options.deps.isVisibleRef.current))
      return true
    },
    resetOutputSequenceForExit: (ptyId) => outputSession?.resetSequenceForExit(ptyId),
    disposeReattachOutput: () => reattachOutput?.dispose(),
    cancelFreshSpawnFollow: () => cancelFreshSpawnFollow(),
    disposeStartupSession: () => startupSession?.dispose(),
    disposeOutputSession: () => outputSession?.dispose()
  }
}

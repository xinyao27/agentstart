import type { SleepingAgentSessionRecord } from '@yiru/protocol/agent/session-resume'
import { useAppStore } from '~renderer/store/state'
import type { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'

import { POST_REPLAY_MODE_RESET } from '../layout-serialization'
import type { ManagedPane, PaneManager } from '../pane-manager/pane-manager'
import type { ActivePaneBindingOptionsOverride } from './active-pane-binding'
import type { PtyConnectionDeps } from './connection-types'
import { createExitSession, type ExitSession } from './exit-session'
import { createHibernatedAgentWake, type HibernatedAgentWake } from './hibernated-agent-wake'
import type { PaneBinding } from './pane-binding'
import type { ReplayWriter } from './replay-writer'
import type { PtyTransport } from './transport-types'

type ConnectionExitOptions = {
  pane: ManagedPane
  manager: PaneManager
  deps: PtyConnectionDeps
  paneKey: string
  paneBinding: PaneBinding
  writer: ReplayWriter
  kittyKeyboardModes: TerminalKittyKeyboardModeTracker
  getTransport: () => PtyTransport
  getIsDisposed: () => boolean
  getSleepingRecord: () => SleepingAgentSessionRecord | null
  getHadExistingPaneTransport: () => boolean
  getRestoredPtyId: () => string | null
  getLastInputAt: () => number
  getHasReceivedOutput: () => boolean
  resetOutputSequence: (ptyId: string) => void
  disposeProcessTracking: () => void
  bindActivePanePty: (ptyId: string, override?: ActivePaneBindingOptionsOverride) => void
}

export type ConnectionExit = {
  exitSession: ExitSession
  hibernatedAgentWake: HibernatedAgentWake
  onPtySpawn: (ptyId: string) => void
}

export function createConnectionExit(options: ConnectionExitOptions): ConnectionExit {
  const hibernatedAgentWake = createHibernatedAgentWake({
    getIsDisposed: options.getIsDisposed,
    getIsCurrentTransport: () =>
      options.deps.paneTransportsRef.current.get(options.pane.id) === options.getTransport(),
    getIsVisible: () => options.deps.isVisibleRef.current,
    getPtyId: () => options.getTransport().getPtyId(),
    getSleepingRecord: options.getSleepingRecord,
    getIsSuppressedExit: (ptyId) => useAppStore.getState().suppressedPtyExitIds[ptyId] === true
  })
  const focusSurvivingPane = (): void => {
    if (options.manager.getActivePane()?.id !== options.pane.id) {
      return
    }
    const hasPtyBinding = (paneId: number): boolean =>
      Boolean(options.deps.paneTransportsRef.current.get(paneId)?.getPtyId())
    const activeLeafId =
      useAppStore.getState().terminalLayoutsByTabId[options.deps.tabId]?.activeLeafId ?? null
    const activePaneId = activeLeafId ? options.manager.getNumericIdForLeaf(activeLeafId) : null
    const siblingPaneId =
      activePaneId !== null && activePaneId !== options.pane.id && hasPtyBinding(activePaneId)
        ? activePaneId
        : (options.manager
            .getPanes()
            .find((candidate) => candidate.id !== options.pane.id && hasPtyBinding(candidate.id))
            ?.id ?? null)
    if (siblingPaneId !== null) {
      options.manager.setActivePane(siblingPaneId, {
        focus: options.deps.isActiveRef.current && options.deps.isVisibleRef.current
      })
    }
  }
  const exitSession = createExitSession({
    paneKey: options.paneKey,
    paneId: options.pane.id,
    tabId: options.deps.tabId,
    getTransport: options.getTransport,
    getCurrentPaneTransport: () => options.deps.paneTransportsRef.current.get(options.pane.id),
    getPaneCount: () => options.manager.getPanes().length,
    getIsVisible: () => options.deps.isVisibleRef.current,
    getHadExistingPaneTransport: options.getHadExistingPaneTransport,
    getRestoredPtyId: options.getRestoredPtyId,
    getLastInputAt: options.getLastInputAt,
    getHasReceivedOutput: options.getHasReceivedOutput,
    resetOutputSequence: options.resetOutputSequence,
    disposeProcessTracking: options.disposeProcessTracking,
    dropSideEffectFacts: options.paneBinding.dropFacts,
    clearPaneBinding: options.paneBinding.clear,
    resetKeyboardModes: options.kittyKeyboardModes.reset,
    consumeSuppressedExit: options.deps.consumeSuppressedPtyExit,
    clearExitedLayoutBinding: (ptyId) =>
      options.deps.clearExitedPanePtyLayoutBinding(options.pane.id, ptyId),
    clearRuntimeTitle: () =>
      options.deps.clearRuntimePaneTitle(options.deps.tabId, options.pane.id),
    clearTabPtyId: (ptyId) => options.deps.clearTabPtyId(options.deps.tabId, ptyId),
    setCacheTimerStartedAt: (timestamp) =>
      options.deps.setCacheTimerStartedAt(options.paneKey, timestamp),
    setGpuRendering: (enabled) => options.manager.setPaneGpuRendering(options.pane.id, enabled),
    armHibernatedWake: hibernatedAgentWake.armFromSuppressedExit,
    resetFrozenTerminalModes: () => options.writer.write(POST_REPLAY_MODE_RESET),
    exitSolePane: (ptyId) => options.deps.onPtyExitRef.current(ptyId),
    focusSurvivingPane,
    closePane: () => options.manager.closePane(options.pane.id)
  })

  return {
    exitSession,
    hibernatedAgentWake,
    onPtySpawn: (ptyId) => {
      exitSession.markFreshSpawn(ptyId)
      options.bindActivePanePty(ptyId, { seedInitialAgentStatus: true })
    }
  }
}

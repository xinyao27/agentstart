import { makePaneKey } from '@yiru/protocol/terminal/pane-identity'
import { useEffect } from 'react'
import { CODEX_ACCOUNT_RESTART_STARTUP } from '~renderer/agent-session/codex-restart'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import { connectPanePty } from './pty/connection'
import type { PtyConnectionDeps } from './pty/connection-types'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

function createRestartPtyDeps(deps: UseTerminalPaneLifecycleDeps): PtyConnectionDeps {
  return {
    tabId: deps.tabId,
    worktreeId: deps.worktreeId,
    cwd: deps.cwd,
    startup: CODEX_ACCOUNT_RESTART_STARTUP,
    paneTransportsRef: deps.paneTransportsRef,
    paneMode2031Ref: deps.paneMode2031Ref,
    paneKittyKeyboardModesRef: deps.paneKittyKeyboardModesRef,
    paneLastThemeModeRef: deps.paneLastThemeModeRef,
    replayingPanesRef: deps.replayingPanesRef,
    isActiveRef: deps.isActiveRef,
    isVisibleRef: deps.isVisibleRef,
    onPtyExitRef: deps.onPtyExitRef,
    onPtyErrorRef: deps.onPtyErrorRef,
    clearTabPtyId: deps.clearTabPtyId,
    consumeSuppressedPtyExit: useAppStore.getState().consumeSuppressedPtyExit,
    updateTabTitle: deps.updateTabTitle,
    setRuntimePaneTitle: deps.setRuntimePaneTitle,
    clearRuntimePaneTitle: deps.clearRuntimePaneTitle,
    updateTabPtyId: deps.updateTabPtyId,
    markWorktreeUnread: deps.markWorktreeUnread,
    markTerminalTabUnread: deps.markTerminalTabUnread,
    markTerminalPaneUnread: deps.markTerminalPaneUnread,
    clearWorktreeUnread: deps.clearWorktreeUnread,
    clearTerminalTabUnread: deps.clearTerminalTabUnread,
    clearTerminalPaneUnread: deps.clearTerminalPaneUnread,
    onShowSessionRestoredBanner: deps.onShowSessionRestoredBanner,
    dispatchNotification: deps.dispatchNotification,
    setCacheTimerStartedAt: deps.setCacheTimerStartedAt,
    syncPanePtyLayoutBinding: deps.syncPanePtyLayoutBinding,
    clearExitedPanePtyLayoutBinding: deps.clearExitedPanePtyLayoutBinding
  }
}

export function useTerminalCodexRestart(deps: UseTerminalPaneLifecycleDeps): void {
  const {
    consumePendingCodexPaneRestart,
    managerRef,
    paneTransportsRef,
    pendingCodexPaneRestartIds
  } = deps
  const restartPane = useEventCallback((paneId: number) => {
    const manager = managerRef.current
    const pane = manager?.getPanes().find((candidate) => candidate.id === paneId)
    if (!manager || !pane) {
      return
    }
    const transport = deps.paneTransportsRef.current.get(paneId)
    const existingPtyId = transport?.getPtyId()
    if (existingPtyId) {
      deps.suppressPtyExit(existingPtyId)
      deps.clearCodexRestartNotice(existingPtyId)
      // Why: an account switch replaces only this session; suppressing its exit
      // keeps the split mounted while the fresh PTY reconnects in place.
      deps.clearTabPtyId(deps.tabId, existingPtyId)
    }

    deps.panePtyBindingsRef.current.get(paneId)?.dispose()
    deps.panePtyBindingsRef.current.delete(paneId)
    deps.syncPanePtyLayoutBinding(paneId, null)
    transport?.destroy?.()
    deps.paneTransportsRef.current.delete(paneId)
    deps.setCacheTimerStartedAt(makePaneKey(deps.tabId, pane.leafId), null)
    const binding = connectPanePty(pane, manager, createRestartPtyDeps(deps))
    deps.panePtyBindingsRef.current.set(paneId, binding)
    manager.setActivePane(paneId, { focus: true })
  })

  useEffect(() => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    for (const pane of manager.getPanes()) {
      const ptyId = paneTransportsRef.current.get(pane.id)?.getPtyId()
      if (ptyId && pendingCodexPaneRestartIds[ptyId] && consumePendingCodexPaneRestart(ptyId)) {
        restartPane(pane.id)
      }
    }
  }, [
    consumePendingCodexPaneRestart,
    managerRef,
    paneTransportsRef,
    pendingCodexPaneRestartIds,
    restartPane
  ])
}

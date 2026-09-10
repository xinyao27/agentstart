import { makePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import { useState } from 'react'

import { closeRemoteRuntimeTerminal } from '../runtime/remote-runtime-session'
import { inspectRuntimeTerminalProcess } from '../runtime/terminal-inspection'
import { useAppStore } from '../store/state'
import { isUnifiedTabPinned } from '../tab-bar/state/pinned-close-guard'
import type { CloseTerminalDialogCopyKind } from './close-terminal-dialog'
import type { PaneManager } from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'

type TerminalPaneCloseInput = {
  clearSessionRestoredBannerForPane: (paneId: number) => void
  managerRef: React.RefObject<PaneManager | null>
  onCloseTab: () => void
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  syncPanePtyLayoutBinding: (paneId: number, ptyId: string | null) => void
  tabId: string
  worktreeId: string
}

export function useTerminalPaneClose({
  clearSessionRestoredBannerForPane,
  managerRef,
  onCloseTab,
  paneTransportsRef,
  syncPanePtyLayoutBinding,
  tabId,
  worktreeId
}: TerminalPaneCloseInput): {
  handleCancelClose: () => void
  handleConfirmClose: (dontAskAgain: boolean) => void
  handleRequestClosePane: (paneId: number) => void
  pendingCloseConfirmation: { paneId: number; copyKind: CloseTerminalDialogCopyKind } | null
} {
  const [pendingCloseConfirmation, setPendingCloseConfirmation] = useState<{
    paneId: number
    copyKind: CloseTerminalDialogCopyKind
  } | null>(null)
  const executeClosePane = (paneId: number): void => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    if (manager.getPanes().length <= 1) {
      onCloseTab()
      return
    }
    const ptyId = paneTransportsRef.current.get(paneId)?.getPtyId() ?? null
    closeRemoteRuntimeTerminal(ptyId)
    clearSessionRestoredBannerForPane(paneId)
    const leafId = manager.getLeafId(paneId)
    if (leafId) {
      const state = useAppStore.getState()
      state.setCacheTimerStartedAt(makePaneKey(tabId, leafId), null)
      state.dropAgentStatus(makePaneKey(tabId, leafId))
    }
    syncPanePtyLayoutBinding(paneId, null)
    manager.closePane(paneId)
  }
  const getCloseDialogCopyKind = (paneId: number): CloseTerminalDialogCopyKind => {
    const leafId = managerRef.current?.getLeafId(paneId)
    if (!leafId) {
      return 'command'
    }
    const agentType =
      useAppStore.getState().agentStatusByPaneKey[makePaneKey(tabId, leafId)]?.agentType
    return agentType && agentType !== 'unknown' ? 'agent' : 'command'
  }
  const handleRequestClosePane = (paneId: number): void => {
    const isLastPane = (managerRef.current?.getPanes().length ?? 0) <= 1
    if (isLastPane) {
      const state = useAppStore.getState()
      if (
        (state.settings?.confirmClosePinnedTab ?? true) &&
        isUnifiedTabPinned(state, worktreeId, tabId)
      ) {
        executeClosePane(paneId)
        return
      }
    }
    const ptyId = paneTransportsRef.current.get(paneId)?.getPtyId()
    if (!ptyId) {
      executeClosePane(paneId)
      return
    }
    const settings = useAppStore.getState().settings
    void inspectRuntimeTerminalProcess(settings, ptyId)
      .then((process) => {
        if (!process.hasChildProcesses || settings?.skipCloseTerminalWithRunningProcessConfirm) {
          executeClosePane(paneId)
        } else {
          setPendingCloseConfirmation({ paneId, copyKind: getCloseDialogCopyKind(paneId) })
        }
      })
      .catch(() => executeClosePane(paneId))
  }

  return {
    handleCancelClose: () => setPendingCloseConfirmation(null),
    handleConfirmClose: (dontAskAgain) => {
      if (pendingCloseConfirmation === null) {
        return
      }
      const paneId = pendingCloseConfirmation.paneId
      setPendingCloseConfirmation(null)
      if (dontAskAgain) {
        void useAppStore.getState().updateSettings({
          skipCloseTerminalWithRunningProcessConfirm: true
        })
      }
      executeClosePane(paneId)
    },
    handleRequestClosePane,
    pendingCloseConfirmation
  }
}

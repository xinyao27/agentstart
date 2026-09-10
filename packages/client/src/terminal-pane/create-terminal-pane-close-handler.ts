import { makePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import type { IDisposable } from '@xterm/xterm'
import type { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'

import { scheduleRuntimeGraphSync } from '../runtime/sync-runtime-graph'
import { useAppStore } from '../store/state'
import {
  resolveTabTitleAfterPaneClose,
  shouldClearLaunchAgentForClosedPane
} from './close-identity'
import type { PaneManager } from './pane-manager/pane-manager'
import type { PaneManagerOptions } from './pane-manager/types'
import type { PtyTransport } from './pty/transport-types'
import type { ReplayingPanesRef } from './replay-guard'
import type { PaneCwdMap } from './resolve-split-cwd'
import { suppressIntentionalPaneCloseExit } from './terminal-pane-lifecycle-decisions'

type PaneCloseDisposables = {
  fileLinkClickFallback: Map<number, IDisposable>
  httpLinkClickFallback: Map<number, IDisposable>
  imeComposition: Map<number, IDisposable>
  imeNativeTextForwarder: Map<number, IDisposable>
  linkProvider: Map<number, IDisposable>
  mode2031: Map<number, IDisposable[]>
  mouseHide: Map<number, IDisposable>
  osc52: Map<number, IDisposable>
  osc7: Map<number, IDisposable>
  selection: Map<number, IDisposable>
  terminalHandleLink: Map<number, IDisposable>
}

type TerminalPaneCloseHandlerInput = {
  clearRuntimePaneTitle: (tabId: string, paneId: number) => void
  clearTabPtyId: (tabId: string, ptyId: string) => void
  disposables: PaneCloseDisposables
  managerRef: React.RefObject<PaneManager | null>
  paneCwdMap: PaneCwdMap
  paneFontSizes: Map<number, number>
  paneKittyKeyboardModes: Map<number, TerminalKittyKeyboardModeTracker>
  paneLastThemeMode: Map<number, 'dark' | 'light'>
  paneMode2031: Map<number, boolean>
  panePtyBindings: Map<number, IDisposable>
  paneTitlesRef: React.RefObject<Record<number, string>>
  paneTransports: Map<number, PtyTransport>
  replayingPanesRef: ReplayingPanesRef
  restoredViewportBlankingPanes: Set<number>
  selectionCaptureTimers: Map<number, number>
  setPaneCount: React.Dispatch<React.SetStateAction<number>>
  setPaneTitles: React.Dispatch<React.SetStateAction<Record<number, string>>>
  setRenamingPaneId: React.Dispatch<React.SetStateAction<number | null>>
  syncPanePtyLayoutBinding: (paneId: number, ptyId: string | null) => void
  tabId: string
  updateTabTitle: (tabId: string, title: string) => void
  worktreeId: string
}

function disposePaneEntry(map: Map<number, IDisposable>, paneId: number): void {
  map.get(paneId)?.dispose()
  map.delete(paneId)
}

export function createTerminalPaneCloseHandler({
  clearRuntimePaneTitle,
  clearTabPtyId,
  disposables,
  managerRef,
  paneCwdMap,
  paneFontSizes,
  paneKittyKeyboardModes,
  paneLastThemeMode,
  paneMode2031,
  panePtyBindings,
  paneTitlesRef,
  paneTransports,
  replayingPanesRef,
  restoredViewportBlankingPanes,
  selectionCaptureTimers,
  setPaneCount,
  setPaneTitles,
  setRenamingPaneId,
  syncPanePtyLayoutBinding,
  tabId,
  updateTabTitle,
  worktreeId
}: TerminalPaneCloseHandlerInput): NonNullable<PaneManagerOptions['onPaneClosed']> {
  return (paneId, closedPane) => {
    const isDetachedToTab = closedPane?.reason === 'detach'
    disposePaneEntry(disposables.linkProvider, paneId)
    disposePaneEntry(disposables.terminalHandleLink, paneId)
    disposePaneEntry(disposables.fileLinkClickFallback, paneId)
    disposePaneEntry(disposables.httpLinkClickFallback, paneId)
    disposePaneEntry(disposables.selection, paneId)
    disposePaneEntry(disposables.imeComposition, paneId)
    disposePaneEntry(disposables.imeNativeTextForwarder, paneId)
    disposePaneEntry(disposables.mouseHide, paneId)
    disposePaneEntry(disposables.osc52, paneId)
    disposePaneEntry(disposables.osc7, paneId)
    const captureTimer = selectionCaptureTimers.get(paneId)
    if (captureTimer !== undefined) {
      window.clearTimeout(captureTimer)
      selectionCaptureTimers.delete(paneId)
    }
    for (const disposable of disposables.mode2031.get(paneId) ?? []) {
      disposable.dispose()
    }
    disposables.mode2031.delete(paneId)
    paneMode2031.delete(paneId)
    paneKittyKeyboardModes.delete(paneId)
    paneLastThemeMode.delete(paneId)
    paneCwdMap.delete(paneId)

    const transport = paneTransports.get(paneId)
    const closedPtyId = transport?.getPtyId() ?? null
    const state = useAppStore.getState()
    const terminalTab = state.tabsByWorktree[worktreeId]?.find(
      (candidate) => candidate.id === tabId
    )
    if (!isDetachedToTab && shouldClearLaunchAgentForClosedPane(terminalTab, closedPtyId)) {
      state.clearTabLaunchAgent(tabId)
    }
    disposePaneEntry(panePtyBindings, paneId)
    if (closedPane?.leafId && !isDetachedToTab) {
      state.retireAgentPaneAuthority(makePaneKey(tabId, closedPane.leafId))
    }
    if (transport) {
      if (isDetachedToTab) {
        transport.detach?.()
      } else {
        const ptyId = suppressIntentionalPaneCloseExit(transport, state.suppressPtyExit)
        if (ptyId) {
          syncPanePtyLayoutBinding(paneId, null)
          clearTabPtyId(tabId, ptyId)
        }
        transport.destroy?.()
      }
      paneTransports.delete(paneId)
    }

    clearRuntimePaneTitle(tabId, paneId)
    paneFontSizes.delete(paneId)
    replayingPanesRef.current.delete(paneId)
    restoredViewportBlankingPanes.delete(paneId)
    setPaneTitles((previous) => {
      if (!(paneId in previous)) {
        return previous
      }
      const next = { ...previous }
      delete next[paneId]
      return next
    })
    if (paneId in paneTitlesRef.current) {
      const next = { ...paneTitlesRef.current }
      delete next[paneId]
      paneTitlesRef.current = next
    }
    setRenamingPaneId((previous) => (previous === paneId ? null : previous))
    setPaneCount(managerRef.current?.getPanes().length ?? 0)
    const newActivePane = managerRef.current?.getActivePane()
    if (newActivePane) {
      const paneTitles = useAppStore.getState().runtimePaneTitlesByTabId[tabId] ?? {}
      updateTabTitle(tabId, resolveTabTitleAfterPaneClose(paneTitles, newActivePane.id))
    }
    scheduleRuntimeGraphSync()
  }
}

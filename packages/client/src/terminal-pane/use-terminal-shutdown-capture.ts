import { useEffect } from 'react'
import { shouldPreserveTerminalScrollbackBuffers } from '~renderer/terminal-workspace/scrollback-buffers'

import { shutdownBufferCaptures } from '../runtime/terminal-shutdown-buffer-captures'
import { useAppStore } from '../store/state'
import type { PaneManager } from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'
import { captureTerminalShutdownLayout } from './terminal-shutdown-layout-capture'

type TerminalShutdownCaptureInput = {
  clearedScrollbackLeafIdsRef: React.RefObject<Set<string>>
  containerRef: React.RefObject<HTMLDivElement | null>
  expandedPaneIdRef: React.RefObject<number | null>
  managerRef: React.RefObject<PaneManager | null>
  paneTitlesRef: React.RefObject<Record<number, string>>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  tabId: string
  worktreeId: string
}

export function useTerminalShutdownCapture({
  clearedScrollbackLeafIdsRef,
  containerRef,
  expandedPaneIdRef,
  managerRef,
  paneTitlesRef,
  paneTransportsRef,
  tabId,
  worktreeId
}: TerminalShutdownCaptureInput): void {
  useEffect(() => {
    const captureBuffers = (options?: { includeLocalBuffers?: boolean }): void => {
      const manager = managerRef.current
      const container = containerRef.current
      if (!manager || !container || manager.getPanes().length === 0) {
        return
      }
      const state = useAppStore.getState()
      const includeLocalBuffers = options?.includeLocalBuffers ?? true
      const layout = captureTerminalShutdownLayout({
        manager,
        container,
        expandedPaneId: expandedPaneIdRef.current,
        paneTransports: paneTransportsRef.current,
        paneTitlesByPaneId: paneTitlesRef.current,
        existingLayout: state.terminalLayoutsByTabId[tabId],
        captureBuffers: includeLocalBuffers
          ? true
          : shouldPreserveTerminalScrollbackBuffers(worktreeId, state.repos),
        clearedScrollbackLeafIds: clearedScrollbackLeafIdsRef.current
      })
      state.setTabLayout(tabId, layout)
      for (const pane of manager.getPanes()) {
        clearedScrollbackLeafIdsRef.current.delete(pane.leafId)
      }
    }
    shutdownBufferCaptures.set(tabId, captureBuffers)
    return () => {
      if (shutdownBufferCaptures.get(tabId) === captureBuffers) {
        shutdownBufferCaptures.delete(tabId)
      }
    }
  }, [
    clearedScrollbackLeafIdsRef,
    containerRef,
    expandedPaneIdRef,
    managerRef,
    paneTitlesRef,
    paneTransportsRef,
    tabId,
    worktreeId
  ])
}

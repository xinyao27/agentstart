import { readProjectCatalogSnapshot } from '../project-catalog/catalog-snapshot'
import { useAppStore } from '../store/state'
import { applyExpandedLayoutTo } from './expand-collapse'
import { replayTerminalLayout, restoreScrollbackBuffers } from './layout-serialization'
import type { PaneManager } from './pane-manager/pane-manager'
import { canReleaseReplayedScrollbackFromStore } from './replayed-scrollback-store-release'
import { mapRestoredPaneTitlesByPaneId } from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

type RestoreTerminalPaneLayoutInput = Pick<
  UseTerminalPaneLifecycleDeps,
  | 'containerRef'
  | 'expandedStyleSnapshotRef'
  | 'initialLayoutRef'
  | 'managerRef'
  | 'paneTitlesRef'
  | 'replayingPanesRef'
  | 'setExpandedPane'
  | 'setPaneTitles'
  | 'tabId'
  | 'worktreeId'
> & {
  isActive: boolean
  manager: PaneManager
  restoredViewportBlankingPanesRef: React.RefObject<Set<number>>
}

export function restoreTerminalPaneLayout({
  containerRef,
  expandedStyleSnapshotRef,
  initialLayoutRef,
  isActive,
  manager,
  managerRef,
  paneTitlesRef,
  replayingPanesRef,
  restoredViewportBlankingPanesRef,
  setExpandedPane,
  setPaneTitles,
  tabId,
  worktreeId
}: RestoreTerminalPaneLayoutInput): void {
  const initialLayoutHadBuffers = Boolean(initialLayoutRef.current.buffersByLeafId)
  const restoredPaneByLeafId = replayTerminalLayout(manager, initialLayoutRef.current, isActive)
  const restoredBuffers = initialLayoutRef.current.buffersByLeafId
  restoreScrollbackBuffers(
    manager,
    restoredBuffers,
    initialLayoutRef.current.scrollbackGridsByLeafId,
    restoredPaneByLeafId,
    replayingPanesRef,
    restoredViewportBlankingPanesRef
  )
  const hasScrollbackRefs = Boolean(initialLayoutRef.current.scrollbackRefsByLeafId)
  if (
    restoredBuffers &&
    canReleaseReplayedScrollbackFromStore({
      hasScrollbackRefs,
      worktreeId,
      repos: readProjectCatalogSnapshot().repos
    })
  ) {
    const layoutWithoutRestoredBuffers = { ...initialLayoutRef.current }
    delete layoutWithoutRestoredBuffers.buffersByLeafId
    if (hasScrollbackRefs) {
      initialLayoutRef.current = layoutWithoutRestoredBuffers
    }
    if (initialLayoutHadBuffers) {
      useAppStore.getState().setTabLayout(tabId, layoutWithoutRestoredBuffers)
    }
  }

  const restoredTitles = mapRestoredPaneTitlesByPaneId(
    initialLayoutRef.current.titlesByLeafId,
    restoredPaneByLeafId
  )
  if (Object.keys(restoredTitles).length > 0) {
    setPaneTitles((previous) => ({ ...previous, ...restoredTitles }))
    paneTitlesRef.current = { ...paneTitlesRef.current, ...restoredTitles }
  }

  const restoredActivePaneId =
    (initialLayoutRef.current.activeLeafId
      ? restoredPaneByLeafId.get(initialLayoutRef.current.activeLeafId)
      : null) ??
    manager.getActivePane()?.id ??
    manager.getPanes()[0]?.id ??
    null
  if (restoredActivePaneId !== null) {
    manager.setActivePane(restoredActivePaneId, { focus: isActive })
  }
  const restoredExpandedPaneId = initialLayoutRef.current.expandedLeafId
    ? (restoredPaneByLeafId.get(initialLayoutRef.current.expandedLeafId) ?? null)
    : null
  if (restoredExpandedPaneId !== null && manager.getPanes().length > 1) {
    setExpandedPane(restoredExpandedPaneId)
    applyExpandedLayoutTo(restoredExpandedPaneId, {
      managerRef,
      containerRef,
      expandedStyleSnapshotRef
    })
    return
  }
  setExpandedPane(null)
}

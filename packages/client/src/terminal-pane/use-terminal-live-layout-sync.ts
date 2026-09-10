import type { TerminalLayoutSnapshot } from '@agentstart/protocol/workspace/session'
import { useEffect } from 'react'

import type { PaneManager } from './pane-manager/pane-manager'
import {
  isHostAuthoritativeLayout,
  planTerminalLiveLayoutInsertions
} from './terminal-live-layout-reconciliation'

type TerminalLiveLayoutSyncInput = {
  isActive: boolean
  managerRef: React.RefObject<PaneManager | null>
  paneCount: number
  persistLayoutSnapshot: () => void
  restoredLayout: TerminalLayoutSnapshot
}

export function useTerminalLiveLayoutSync({
  isActive,
  managerRef,
  paneCount,
  persistLayoutSnapshot,
  restoredLayout
}: TerminalLiveLayoutSyncInput): void {
  useEffect(() => {
    const manager = managerRef.current
    if (
      !manager ||
      !restoredLayout.root ||
      !isHostAuthoritativeLayout({
        isBrowserRenderer: true,
        ptyIdsByLeafId: restoredLayout.ptyIdsByLeafId
      })
    ) {
      return
    }
    const insertions = planTerminalLiveLayoutInsertions(
      restoredLayout.root,
      manager.getPanes().map((pane) => pane.leafId)
    )
    if (insertions.length === 0) {
      return
    }

    let appliedInsertion = false
    for (const insertion of insertions) {
      const ptyId = restoredLayout.ptyIdsByLeafId?.[insertion.newLeafId]
      const sourcePaneId = manager.getNumericIdForLeaf(insertion.sourceLeafId)
      if (!ptyId || sourcePaneId === null || manager.getNumericIdForLeaf(insertion.newLeafId)) {
        continue
      }
      // Why: host snapshots arrive after the manager mounts. Adopt their leaf
      // and PTY in place; before-placement needs the host ratio inverted.
      const splitRatio =
        insertion.ratio === undefined
          ? undefined
          : insertion.placement === 'before'
            ? 1 - insertion.ratio
            : insertion.ratio
      const pane = manager.splitPaneAroundLeafIds(
        insertion.sourceLeafIds,
        sourcePaneId,
        insertion.direction,
        {
          ...(splitRatio !== undefined && { ratio: splitRatio }),
          leafId: insertion.newLeafId,
          ptyId,
          placement: insertion.placement
        }
      )
      appliedInsertion ||= Boolean(pane)
    }
    if (appliedInsertion) {
      persistLayoutSnapshot()
    }

    const restoredActivePaneId = restoredLayout.activeLeafId
      ? manager.getNumericIdForLeaf(restoredLayout.activeLeafId)
      : null
    const fallbackPaneId = manager.getActivePane()?.id ?? manager.getPanes()[0]?.id ?? null
    const activePaneId = restoredActivePaneId ?? fallbackPaneId
    if (activePaneId !== null) {
      manager.setActivePane(activePaneId, { focus: isActive })
    }
  }, [isActive, managerRef, paneCount, persistLayoutSnapshot, restoredLayout])
}

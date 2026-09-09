import type { SetupSplitDirection } from '@yiru/protocol/settings/workspace-preferences'

import type { PaneManager, ManagedPane } from '../pane-manager/pane-manager'
import { safeFit } from '../pane-manager/pane-tree-ops'
import { waitForStableStartupGrid } from '../terminal-startup-grid-settle'
import { isSetupSplitGeometryReady } from './setup-split-geometry'

const CONNECT_FALLBACK_MS = 250

type StartupConnectGateOptions = {
  pane: ManagedPane
  manager: PaneManager
  setupSplitDirection?: SetupSplitDirection
  shouldSettleGrid: boolean
  isAlive: () => boolean
  onConnect: () => void
}

export type StartupConnectGate = {
  start: () => void
  dispose: () => void
}

export function createStartupConnectGate(options: StartupConnectGateOptions): StartupConnectGate {
  let connectFrame: number | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let gridSettleHandle: ReturnType<typeof waitForStableStartupGrid> | null = null
  let hasSettledGrid = false
  let hasConnected = false

  const cancelScheduledConnect = (): void => {
    if (connectFrame !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(connectFrame)
      }
      connectFrame = null
    }
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }

  const measureGrid = (): { cols: number; rows: number } | null => {
    if (!safeFit(options.pane)) {
      return null
    }
    const cols = options.pane.terminal.cols
    const rows = options.pane.terminal.rows
    return cols > 0 && rows > 0 ? { cols, rows } : null
  }

  const isReadyToSettle = (): boolean =>
    options.setupSplitDirection
      ? isSetupSplitGeometryReady(options.pane, options.manager, options.setupSplitDirection)
      : true

  const connect = (): void => {
    if (hasConnected) {
      return
    }
    if (!hasSettledGrid && options.shouldSettleGrid) {
      cancelScheduledConnect()
      gridSettleHandle?.cancel()
      let settledSynchronously = false
      const handle = waitForStableStartupGrid({
        isAlive: options.isAlive,
        isReadyToSettle: options.setupSplitDirection ? isReadyToSettle : undefined,
        measure: measureGrid,
        onSettled: () => {
          settledSynchronously = true
          gridSettleHandle = null
          hasSettledGrid = true
          connect()
        },
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (handle) => {
          if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(handle)
          }
        }
      })
      if (!settledSynchronously) {
        gridSettleHandle = handle
      }
      return
    }
    hasConnected = true
    cancelScheduledConnect()
    if (options.isAlive()) {
      options.onConnect()
    }
  }

  return {
    start: () => {
      fallbackTimer = setTimeout(connect, CONNECT_FALLBACK_MS)
      connectFrame = requestAnimationFrame(connect)
    },
    dispose: () => {
      cancelScheduledConnect()
      gridSettleHandle?.cancel()
      gridSettleHandle = null
    }
  }
}

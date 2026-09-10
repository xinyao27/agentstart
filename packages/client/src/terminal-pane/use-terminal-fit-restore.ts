import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'

import { getAllDrivers } from './pane-manager/mobile-driver-state'
import { getMobileFitOverridePtyIds } from './pane-manager/mobile-fit-overrides'
import type { ManagedPane } from './pane-manager/pane-manager'
import { refitAndRefreshAllTerminalPanes } from './pane-manager/registry'
import type { PtyTransport } from './pty/transport-types'
import { restoreTerminalFitToDesktop, restoreTerminalFitsToDesktop } from './terminal-fit-restore'

type TerminalFitRestoreInput = {
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  refreshMobileFitState: () => void
  settingsRef: React.RefObject<GlobalSettings | null | undefined>
}

export function useTerminalFitRestore({
  paneTransportsRef,
  refreshMobileFitState,
  settingsRef
}: TerminalFitRestoreInput): {
  restoreAllTerminalFits: (focusPane: ManagedPane) => Promise<void>
  restorePaneTerminalFit: (
    pane: ManagedPane,
    ptyId: string,
    fitMode: 'mobile-fit' | 'remote-desktop-fit'
  ) => Promise<void>
} {
  const scheduleRefit = (): void => {
    requestAnimationFrame(refitAndRefreshAllTerminalPanes)
    window.setTimeout(refitAndRefreshAllTerminalPanes, 100)
  }
  const restorePaneTerminalFit = async (
    pane: ManagedPane,
    ptyId: string,
    fitMode: 'mobile-fit' | 'remote-desktop-fit'
  ): Promise<void> => {
    const transport = paneTransportsRef.current.get(pane.id)
    if ((transport?.getPtyId() ?? null) !== ptyId) {
      refreshMobileFitState()
      return
    }
    if (fitMode === 'remote-desktop-fit' && transport?.claimViewport) {
      let proposed: { cols: number; rows: number } | undefined
      try {
        proposed = pane.fitAddon.proposeDimensions()
      } catch {
        proposed = undefined
      }
      if (
        proposed &&
        proposed.cols > 0 &&
        proposed.rows > 0 &&
        transport.claimViewport(proposed.cols, proposed.rows)
      ) {
        return
      }
    }
    if (await restoreTerminalFitToDesktop(ptyId, settingsRef.current ?? undefined)) {
      scheduleRefit()
      pane.terminal.focus()
    }
  }
  const restoreAllTerminalFits = async (focusPane: ManagedPane): Promise<void> => {
    const ptyIds = new Set(getMobileFitOverridePtyIds())
    for (const [ptyId, driver] of getAllDrivers()) {
      if (driver.kind === 'mobile') {
        ptyIds.add(ptyId)
      }
    }
    if (await restoreTerminalFitsToDesktop([...ptyIds], settingsRef.current ?? undefined)) {
      scheduleRefit()
      focusPane.terminal.focus()
    }
  }
  return { restoreAllTerminalFits, restorePaneTerminalFit }
}

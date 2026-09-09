// Why: this renderer cache is a projection of main's TerminalSessionAuthority.
// It drives immediate UI locks but never decides who owns the input floor.
//
// While `getDriverForPty(ptyId).kind === 'mobile'` the renderer:
//   - drops xterm.onData (input lock)
//   - drops xterm.onResize (resize lock)
//   - mounts the lock banner with the "Take back" affordance
//
// See docs/mobile-presence-lock.md.

import type { TerminalDriverState } from '@yiru/protocol'

export type DriverState = TerminalDriverState

const driverByPtyId = new Map<string, DriverState>()

type DriverChangeEvent = {
  ptyId: string
  driver: DriverState
}
type DriverChangeListener = (event: DriverChangeEvent) => void
const changeListeners = new Set<DriverChangeListener>()

export function onDriverChange(listener: DriverChangeListener): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

function notifyChange(event: DriverChangeEvent): void {
  for (const listener of changeListeners) {
    listener(event)
  }
}

export function setDriverForPty(ptyId: string, driver: DriverState): void {
  if (driver.kind === 'idle') {
    driverByPtyId.delete(ptyId)
  } else {
    driverByPtyId.set(ptyId, driver)
  }
  notifyChange({ ptyId, driver })
}

export function getDriverForPty(ptyId: string): DriverState {
  return driverByPtyId.get(ptyId) ?? { kind: 'idle' }
}

export function getAllDrivers(): Map<string, DriverState> {
  return new Map(driverByPtyId)
}

export function isPtyLocked(ptyId: string): boolean {
  return driverByPtyId.get(ptyId)?.kind === 'mobile'
}

export function hydrateDrivers(drivers: { ptyId: string; driver: DriverState }[]): void {
  const affectedPtyIds = new Set(driverByPtyId.keys())
  driverByPtyId.clear()

  for (const { ptyId, driver } of drivers) {
    affectedPtyIds.add(ptyId)
    if (driver.kind !== 'idle') {
      driverByPtyId.set(ptyId, driver)
    }
  }

  // Why: startup hydration can arrive after TerminalPane has mounted. Notify
  // all affected PTYs so the pane-local overlay cannot miss an active lock.
  for (const ptyId of affectedPtyIds) {
    notifyChange({ ptyId, driver: getDriverForPty(ptyId) })
  }
}

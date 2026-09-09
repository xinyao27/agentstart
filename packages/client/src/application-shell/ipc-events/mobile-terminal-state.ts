import type { TerminalDriverState } from '@yiru/protocol'
import { subscribeRuntimeDriverEvents } from '~renderer/runtime/runtime-driver-events-client'
import { shellClient } from '~renderer/runtime/shell-client'
import {
  hydrateDrivers,
  setDriverForPty
} from '~renderer/terminal-pane/pane-manager/mobile-driver-state'
import {
  hydrateOverrides,
  setFitOverride
} from '~renderer/terminal-pane/pane-manager/mobile-fit-overrides'

import { isRuntimeEnvironmentActive } from './runtime-projects'

const MAX_PENDING_EVENTS = 300
type PendingEvent =
  | {
      kind: 'fit'
      event: {
        ptyId: string
        mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
        cols: number
        rows: number
      }
    }
  | { kind: 'driver'; event: { ptyId: string; driver: TerminalDriverState } }

export function subscribeMobileTerminalState(): () => void {
  let isHydrated = isRuntimeEnvironmentActive()
  let isDisposed = false
  let hydrationRequestId = 0
  const pendingEvents: PendingEvent[] = []

  const applyPendingEvents = (): void => {
    for (const pending of pendingEvents) {
      if (pending.kind === 'fit') {
        setFitOverride(
          pending.event.ptyId,
          pending.event.mode,
          pending.event.cols,
          pending.event.rows
        )
      } else {
        setDriverForPty(pending.event.ptyId, pending.event.driver)
      }
    }
    pendingEvents.length = 0
  }
  const enqueue = (event: PendingEvent): void => {
    pendingEvents.push(event)
    while (pendingEvents.length > MAX_PENDING_EVENTS) {
      pendingEvents.shift()
    }
  }
  const hydrate = (): void => {
    if (isRuntimeEnvironmentActive()) {
      return
    }
    const requestId = ++hydrationRequestId
    isHydrated = false
    pendingEvents.length = 0
    void Promise.all([
      shellClient.runtime.getTerminalFitOverrides(),
      shellClient.runtime.getTerminalDrivers()
    ])
      .then(([overrides, drivers]) => {
        if (isDisposed || requestId !== hydrationRequestId) {
          return
        }
        hydrateOverrides(overrides)
        hydrateDrivers(drivers)
        isHydrated = true
        applyPendingEvents()
      })
      .catch((error: unknown) => {
        if (!isDisposed && requestId === hydrationRequestId) {
          console.error('Failed to hydrate mobile terminal state:', error)
          isHydrated = true
          applyPendingEvents()
        }
      })
  }

  const unsubscribe = subscribeRuntimeDriverEvents({
    onReady: hydrate,
    onEvent: (event) => {
      if (isRuntimeEnvironmentActive()) {
        return
      }
      switch (event.type) {
        case 'terminalFitOverrideChanged':
          if (isHydrated) {
            setFitOverride(event.ptyId, event.mode, event.cols, event.rows)
          } else {
            enqueue({ kind: 'fit', event })
          }
          break
        case 'terminalDriverChanged':
          if (isHydrated) {
            setDriverForPty(event.ptyId, event.driver)
          } else {
            enqueue({ kind: 'driver', event })
          }
          break
      }
    }
  })

  return () => {
    isDisposed = true
    pendingEvents.length = 0
    unsubscribe()
  }
}

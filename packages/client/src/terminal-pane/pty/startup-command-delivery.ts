import type { StartupCommandDelivery } from '@agentstart/protocol/agent/launch/startup-delivery'
import { shouldUseShellReadyStartupDelivery } from '@agentstart/protocol/agent/launch/startup-delivery'

import {
  createShellReadyMarkerScanState,
  scanForShellReadyMarker
} from '../shell-ready-marker-scan'

const SSH_SHELL_READY_FALLBACK_MS = 1500
const STARTUP_COMMAND_INJECT_DELAY_MS = 50

type PendingStartupCommand = {
  command: string
}

type StartupCommandDeliveryOptions = {
  initialCommand: PendingStartupCommand | null
  commandHint: string | undefined
  configuredDelivery: StartupCommandDelivery | undefined
  hasSshConnection: boolean
  useTerminalPaste: boolean
  getIsDisposed: () => boolean
  waitForOutputParsed: () => Promise<void>
  submit: (command: string) => Promise<boolean>
  onSubmitted: () => void
  onRejected: () => void
}

export type StartupCommandDeliveryController = {
  hasPending: () => boolean
  setPending: (command: PendingStartupCommand) => void
  observeOutput: (data: string) => string
  schedule: () => void
  dispose: () => void
}

export function createStartupCommandDelivery(
  options: StartupCommandDeliveryOptions
): StartupCommandDeliveryController {
  let pendingCommand = options.initialCommand
  const shouldWaitForShellReady =
    options.hasSshConnection &&
    shouldUseShellReadyStartupDelivery({
      command: options.commandHint,
      startupCommandDelivery: options.configuredDelivery
    }) &&
    !options.useTerminalPaste
  const markerScan = shouldWaitForShellReady ? createShellReadyMarkerScanState() : null
  let isShellReady = !shouldWaitForShellReady
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let injectTimer: ReturnType<typeof setTimeout> | null = null

  const clearFallbackTimer = (): void => {
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }

  const schedule = (): void => {
    if (!pendingCommand) {
      return
    }
    if (!isShellReady) {
      if (fallbackTimer === null) {
        // Why: some SSH shells cannot emit AgentStart's marker. Prefer it, then fall
        // back to renderer delivery instead of dropping the command forever.
        fallbackTimer = setTimeout(() => {
          fallbackTimer = null
          isShellReady = true
          schedule()
        }, SSH_SHELL_READY_FALLBACK_MS)
      }
      return
    }
    if (injectTimer !== null) {
      clearTimeout(injectTimer)
    }
    injectTimer = setTimeout(() => {
      injectTimer = null
      void (async () => {
        const startup = pendingCommand
        if (!startup || options.getIsDisposed()) {
          return
        }
        if (options.useTerminalPaste) {
          await options.waitForOutputParsed()
        }
        if (pendingCommand !== startup || options.getIsDisposed()) {
          return
        }
        const submitted = await options.submit(startup.command)
        if (submitted) {
          options.onSubmitted()
        } else {
          options.onRejected()
        }
        pendingCommand = null
      })()
    }, STARTUP_COMMAND_INJECT_DELAY_MS)
  }

  return {
    hasPending: () => pendingCommand !== null,
    setPending: (command) => {
      pendingCommand = command
    },
    observeOutput: (data) => {
      if (!markerScan) {
        return data
      }
      const scanned = scanForShellReadyMarker(markerScan, data)
      if (scanned.matched && !isShellReady) {
        isShellReady = true
        clearFallbackTimer()
        schedule()
      }
      return scanned.output
    },
    schedule,
    dispose: () => {
      clearFallbackTimer()
      if (injectTimer !== null) {
        clearTimeout(injectTimer)
        injectTimer = null
      }
    }
  }
}

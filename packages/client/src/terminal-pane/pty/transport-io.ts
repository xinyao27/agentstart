import { useAppStore } from '~renderer/store/state'
import { resolveTerminalColorSchemeMode } from '~renderer/terminal-pane/emulator/color-scheme'
import { mode2031SequenceFor } from '~renderer/terminal-pane/emulator/color-scheme'
import { isPtyLocked } from '~renderer/terminal-pane/pane-manager/mobile-driver-state'
import { getFitOverrideForPty } from '~renderer/terminal-pane/pane-manager/mobile-fit-overrides'
import type { ManagedPane } from '~renderer/terminal-pane/pane-manager/pane-manager'
import { discardTerminalOutput } from '~renderer/terminal-pane/pane-manager/pane-terminal-output-scheduler'
import { registerUndeliverableWriteHandler } from '~renderer/terminal-pane/pane-manager/terminal-write-pipeline-health'
import { getSystemPrefersDark } from '~renderer/terminal/theme'

import { requestTerminalPaneRecovery } from '../recovery'
import {
  CONPTY_DA1_RESPONSE,
  createTerminalPixelSizeQueryResponder,
  installTerminalCapabilityReplyHandlers
} from '../terminal-capability-replies'
import type { PtyTransport } from './transport-types'

type TransportIoOptions = {
  pane: ManagedPane
  transport: PtyTransport
  tabId: string
  recoveryGeneration: number
  recoveryInstanceId: number
  isNativeWindowsConpty: boolean
  getIsDisposed: () => boolean
  getIsReplaying: () => boolean
  recordMode2031Subscription?: (mode: 'dark' | 'light') => void
}

export type TransportIo = {
  sendImmediate: (data: string) => boolean
  handleMode2031Subscribe: () => void
  respondToPixelSizeQueries: (data: string) => void
  claimViewport: () => void
  requestRecovery: () => void
  setConnectStartedAt: (startedAt: number | null) => void
  dispose: () => void
}

export function createTransportIo(options: TransportIoOptions): TransportIo {
  let connectStartedAt: number | null = null
  const sendImmediate = (data: string): boolean => {
    const ptyId = options.transport.getPtyId()
    return (!ptyId || !isPtyLocked(ptyId)) && options.transport.sendInputImmediate(data)
  }
  const capabilityReplies = installTerminalCapabilityReplyHandlers({
    terminal: options.pane.terminal,
    parser: options.pane.terminal.parser,
    sendInput: sendImmediate,
    isReplaying: options.getIsReplaying,
    ...(options.isNativeWindowsConpty ? { da1Response: CONPTY_DA1_RESPONSE } : {})
  })
  const respondToPixelSizeQueries = createTerminalPixelSizeQueryResponder(
    options.pane.terminal,
    sendImmediate
  )
  const requestRecovery = (): void => {
    if (options.transport.isConnected?.() && options.transport.getPtyId() !== null) {
      return
    }
    const isConnectSettling = connectStartedAt !== null && Date.now() - connectStartedAt < 60_000
    if (isConnectSettling || options.getIsDisposed()) {
      return
    }
    const storePtyId = useAppStore.getState().ptyIdsByTabId?.[options.tabId]?.[0] ?? null
    void requestTerminalPaneRecovery({
      tabId: options.tabId,
      ptyId: options.transport.getPtyId() ?? storePtyId,
      reason: 'input-undeliverable',
      terminalRecoveryGeneration: options.recoveryGeneration,
      terminalRecoveryInstanceId: options.recoveryInstanceId,
      requireAuthoritativeLiveness: true
    })
  }
  const unregisterWriteRecovery = registerUndeliverableWriteHandler(
    options.pane.terminal,
    (reason) => {
      discardTerminalOutput(options.pane.terminal)
      const storePtyId = useAppStore.getState().ptyIdsByTabId?.[options.tabId]?.[0] ?? null
      void requestTerminalPaneRecovery({
        tabId: options.tabId,
        ptyId: options.transport.getPtyId() ?? storePtyId,
        reason,
        terminalRecoveryGeneration: options.recoveryGeneration,
        terminalRecoveryInstanceId: options.recoveryInstanceId
      })
    }
  )

  return {
    sendImmediate,
    handleMode2031Subscribe: () => {
      if (options.getIsDisposed() || !options.transport.getPtyId()) {
        return
      }
      const mode = resolveTerminalColorSchemeMode(
        useAppStore.getState().settings,
        getSystemPrefersDark()
      )
      sendImmediate(mode2031SequenceFor(mode))
      options.recordMode2031Subscription?.(mode)
    },
    respondToPixelSizeQueries,
    claimViewport: () => {
      const ptyId = options.transport.getPtyId()
      // Why: fit and driver updates are separate ordered events. Preserve the
      // phone's ownership if mobile-fit arrives just before its input lock.
      if (!ptyId || getFitOverrideForPty(ptyId)?.mode === 'mobile-fit') {
        return
      }
      // Why: multiple workbench pages can subscribe to one PTY. A real keypress
      // makes this pane the authoritative driver; claim before input so a
      // hidden page cannot leave the visible stream rejected as a spectator.
      let proposed: { cols: number; rows: number } | undefined
      try {
        proposed = options.pane.fitAddon.proposeDimensions()
      } catch {
        proposed = undefined
      }
      const cols = proposed?.cols ?? options.pane.terminal.cols
      const rows = proposed?.rows ?? options.pane.terminal.rows
      if (cols > 0 && rows > 0) {
        options.transport.claimViewport?.(cols, rows)
      }
    },
    requestRecovery,
    setConnectStartedAt: (startedAt) => {
      connectStartedAt = startedAt
    },
    dispose: () => {
      unregisterWriteRecovery()
      capabilityReplies.dispose()
    }
  }
}

import type { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'
import { recordTerminalOutput } from '~renderer/terminal-pane/pane-manager/pane-scroll'
import { writeTerminalOutput } from '~renderer/terminal-pane/pane-manager/pane-terminal-output-scheduler'
import { ensureArabicShapingJoinerForText } from '~renderer/terminal-pane/pane-manager/terminal-arabic-shaping-joiner'

import type { ManagedPane } from '../pane-manager/pane-manager'
import { takeCurrentPtyDeliveryAckCredit } from '../terminal-pty-ack-gate'
import { scheduleTerminalWebglAtlasRecovery } from '../terminal-webgl-atlas-recovery'
import { createForegroundOutputController } from './foreground-output-controller'
import type { GeometrySession } from './geometry-session'
import type { HiddenOutputRestoreController } from './hidden-output-restore-types'
import type { HiddenRendererQuery } from './hidden-renderer-query'
import { containsHiddenStartupRendererQuery } from './hidden-startup-renderer-queries'
import { createRendererRisk } from './renderer-risk'
import type { PtyTransport } from './transport-types'

type OutputWriterOptions = {
  pane: ManagedPane
  transport: PtyTransport
  kittyKeyboardModes: TerminalKittyKeyboardModeTracker
  geometry: GeometrySession
  shouldSnapshotHiddenOutput: boolean
  getLastInputAt: () => number
  getIsActiveSplitPane: () => boolean
  getIsForeground: () => boolean
  getIsDisposed: () => boolean
  shouldRefreshForegroundSynchronously: () => boolean
  applyWindowsUnicodeRefresh: boolean
  applyNativeWindowsRewriteRefresh: boolean
  protectNativeWindowsSynchronizedOutput: boolean
}

export type OutputWriter = {
  write: (
    data: string,
    foreground: boolean,
    options?: { hiddenStartupRendererQuery?: boolean }
  ) => void
  beforeWrite: (data: string) => void
  setQuery: (query: HiddenRendererQuery) => void
  setHiddenRestore: (restore: HiddenOutputRestoreController) => void
  resetHiddenRisk: () => void
  resetSkippedHiddenRisk: () => void
  hiddenOutputNeedsAtlasRecovery: (data: string) => boolean
  skipBackgroundAlternateScreenOutput: (data: string) => void
  dispose: () => void
}

export function createOutputWriter(options: OutputWriterOptions): OutputWriter {
  let query: HiddenRendererQuery | null = null
  let hiddenRestore: HiddenOutputRestoreController | null = null
  let backgroundRepaintTimer: ReturnType<typeof setTimeout> | null = null
  const rendererRisk = createRendererRisk({ getPtyId: options.transport.getPtyId })
  const foregroundController = createForegroundOutputController({
    rendererRisk,
    getLastInputAt: options.getLastInputAt,
    getIsActiveSplitPane: options.getIsActiveSplitPane,
    applyWindowsUnicodeRefresh: options.applyWindowsUnicodeRefresh,
    applyNativeWindowsRewriteRefresh: options.applyNativeWindowsRewriteRefresh,
    protectNativeWindowsSynchronizedOutput: options.protectNativeWindowsSynchronizedOutput
  })
  const beforeWrite = (data: string): void => {
    ensureArabicShapingJoinerForText(options.pane.terminal, data)
    recordTerminalOutput(options.pane.terminal)
  }
  const alternateScreenRecovery = (): (() => void) => {
    const wasAlternate = options.pane.terminal.buffer.active.type === 'alternate'
    const switchesBeforeParse = options.geometry.getBufferSwitches()
    return () => {
      if (
        wasAlternate ||
        options.geometry.getBufferSwitches() !== switchesBeforeParse ||
        options.pane.terminal.buffer.active.type === 'alternate'
      ) {
        scheduleTerminalWebglAtlasRecovery()
      }
    }
  }
  const write: OutputWriter['write'] = (data, foreground, writeOptions) => {
    options.kittyKeyboardModes.scan(data)
    if (foreground) {
      hiddenRestore?.resetIfPtyChanged()
      rendererRisk.resetHidden()
    }
    const parseHiddenStartupOutput =
      !foreground &&
      Boolean(options.transport.getPtyId()) &&
      typeof options.transport.serializeBuffer === 'function' &&
      options.shouldSnapshotHiddenOutput &&
      (writeOptions?.hiddenStartupRendererQuery === true ||
        containsHiddenStartupRendererQuery(data))
    const foregroundOutput = foreground || parseHiddenStartupOutput
    if (foreground) {
      options.geometry.scheduleForegroundDriftCheck()
    }
    const decision = foregroundController.decide(data, {
      isForegroundOutput: foregroundOutput,
      isPtyForeground: foreground
    })
    const shouldRecoverAtlas =
      decision.recoverAtlasAfterParse ||
      (!foregroundOutput && rendererRisk.hiddenOutputNeedsAtlasRecovery(data))
    const onParsed = shouldRecoverAtlas
      ? scheduleTerminalWebglAtlasRecovery
      : decision.inPlaceRewrite
        ? alternateScreenRecovery()
        : undefined
    if (!foreground && query?.hasPendingModeSequence()) {
      query.observeMode2031(data)
    }
    writeTerminalOutput(options.pane.terminal, data, {
      foreground: foregroundOutput,
      beforeWrite,
      ackCredit: takeCurrentPtyDeliveryAckCredit() ?? undefined,
      onBackgroundBacklogDropped: hiddenRestore?.markNeeded,
      latencySensitive:
        !foreground || parseHiddenStartupOutput
          ? true
          : decision.synchronizedFrameLatencySensitive ||
            foregroundController.isLatencySensitive(data),
      forceForegroundRefresh:
        foregroundOutput &&
        (decision.synchronizedOutput || decision.nativeCursorRestore || decision.refresh),
      followupForegroundRefresh:
        decision.nativeCursorRestore || decision.nativeInPlaceRewriteFollowup,
      shouldRefreshForegroundSynchronously: options.shouldRefreshForegroundSynchronously,
      onParsed,
      stripTransientCursorShows: options.protectNativeWindowsSynchronizedOutput && foreground,
      coalesceForeground: decision.synchronizedOutput && decision.synchronizedOutputEnded,
      holdForeground: decision.synchronizedOutput && decision.nextSynchronizedOutputActive
    })
  }
  const pulseVisiblePtySize = (): void => {
    if (
      !options.geometry.isRendererResizeAuthoritative() ||
      options.geometry.shouldSuppressDesktopResize()
    ) {
      return
    }
    const cols = options.pane.terminal.cols
    const rows = options.pane.terminal.rows
    if (cols > 2 && rows > 0) {
      options.transport.resize(cols - 1, rows)
      options.transport.resize(cols, rows)
    }
  }

  return {
    write,
    beforeWrite,
    setQuery: (nextQuery) => {
      query = nextQuery
    },
    setHiddenRestore: (restore) => {
      hiddenRestore = restore
    },
    resetHiddenRisk: rendererRisk.resetHidden,
    resetSkippedHiddenRisk: rendererRisk.resetSkippedHidden,
    hiddenOutputNeedsAtlasRecovery: rendererRisk.hiddenOutputNeedsAtlasRecovery,
    skipBackgroundAlternateScreenOutput: (data) => {
      query?.observeSkipped(data)
      rendererRisk.resetSkippedHidden()
      hiddenRestore?.markRendererStateDirty()
      if (!options.transport.getPtyId() || backgroundRepaintTimer !== null) {
        return
      }
      pulseVisiblePtySize()
      backgroundRepaintTimer = setTimeout(() => {
        backgroundRepaintTimer = null
      }, 100)
    },
    dispose: () => {
      if (backgroundRepaintTimer !== null) {
        clearTimeout(backgroundRepaintTimer)
        backgroundRepaintTimer = null
      }
    }
  }
}

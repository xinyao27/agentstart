import { useAppStore } from '~renderer/store/state'

import type { ManagedPane } from '../pane-manager/pane-manager'
import { writeTerminalOutput } from '../pane-manager/pane-terminal-output-scheduler'
import type { TerminalStructuralReplayCoordinator } from '../pane-manager/terminal-structural-replay-coordinator'
import { isTerminalWritePipelineCertifiedDead } from '../pane-manager/terminal-write-pipeline-health'
import { requestTerminalPaneRecovery } from '../recovery'
import { resolveHiddenRestoreScrollbackRows } from '../terminal-hidden-restore-scrollback'
import { warnTerminalLifecycleAnomaly } from '../terminal-lifecycle-diagnostics'
import { createHiddenOutputRestoreController } from './hidden-output-restore-controller'
import type { HiddenOutputRestoreController } from './hidden-output-restore-types'
import type { HiddenRendererQuery } from './hidden-renderer-query'
import type { OrderedOutputSequence } from './ordered-output-sequence'
import type { PtyTransport } from './transport-types'

const RESTORE_UNAVAILABLE_WARNING =
  '\x18\x1b[0m\r\n[AgentStart skipped hidden terminal output because main recovery was unavailable.]\r\n'

type HiddenOutputRestoreSetupOptions = {
  pane: ManagedPane
  coordinator: TerminalStructuralReplayCoordinator
  query: HiddenRendererQuery
  orderedOutput: OrderedOutputSequence
  shouldSnapshotHiddenOutput: boolean
  transport: PtyTransport
  tabId: string
  worktreeId: string
  terminalRecoveryGeneration: number
  terminalRecoveryInstanceId: number
  getIsDisposed: () => boolean
  getIsForeground: () => boolean
  getIsActive: () => boolean
  writeForeground: (data: string) => void
  writeReplayData: (data: string) => void
  hasLiveAgent: () => boolean
  isRendererPtyResizeAuthoritative: () => boolean
  setSuppressPtyResize: (suppress: boolean) => void
  resetHiddenRendererRisk: () => void
  resetSkippedRendererRisk: () => void
  onRestoreSettled: () => void
  beforeTerminalWrite: (data: string) => void
  discardTerminalOutput: () => void
}

export function setupHiddenOutputRestore(
  options: HiddenOutputRestoreSetupOptions
): HiddenOutputRestoreController {
  let hasRequestedCertifiedDeadRecovery = false
  return createHiddenOutputRestoreController({
    pane: options.pane,
    coordinator: options.coordinator,
    query: options.query,
    orderedOutput: options.orderedOutput,
    shouldSnapshotHiddenOutput: options.shouldSnapshotHiddenOutput,
    getIsDisposed: options.getIsDisposed,
    getPtyId: options.transport.getPtyId,
    canUseSnapshot: (ptyId): ptyId is string =>
      Boolean(ptyId) &&
      options.transport.getPtyId() === ptyId &&
      typeof options.transport.serializeBuffer === 'function',
    getIsForeground: options.getIsForeground,
    getIsActive: options.getIsActive,
    ensureWritePipelineAvailable: () => {
      if (!isTerminalWritePipelineCertifiedDead(options.pane.terminal)) {
        return true
      }
      if (!hasRequestedCertifiedDeadRecovery && !options.getIsDisposed()) {
        hasRequestedCertifiedDeadRecovery = true
        const storePtyId = useAppStore.getState().ptyIdsByTabId?.[options.tabId]?.[0] ?? null
        void requestTerminalPaneRecovery({
          tabId: options.tabId,
          ptyId: options.transport.getPtyId() ?? storePtyId,
          reason: 'restore-blocked',
          terminalRecoveryGeneration: options.terminalRecoveryGeneration,
          terminalRecoveryInstanceId: options.terminalRecoveryInstanceId
        })
      }
      return false
    },
    serializeSnapshot: async (ptyId) => {
      try {
        if (
          options.transport.getPtyId() !== ptyId ||
          typeof options.transport.serializeBuffer !== 'function'
        ) {
          return null
        }
        return await options.transport.serializeBuffer({
          scrollbackRows: resolveHiddenRestoreScrollbackRows(
            options.pane.terminal.options.scrollback
          )
        })
      } catch {
        return null
      }
    },
    writeForeground: options.writeForeground,
    writeReplayData: options.writeReplayData,
    hasLiveAgent: options.hasLiveAgent,
    isRendererPtyResizeAuthoritative: options.isRendererPtyResizeAuthoritative,
    resizePty: (cols, rows) => options.transport.resize(cols, rows),
    setSuppressPtyResize: options.setSuppressPtyResize,
    resetHiddenRendererRisk: options.resetHiddenRendererRisk,
    resetSkippedRendererRisk: options.resetSkippedRendererRisk,
    onRestoreSettled: options.onRestoreSettled,
    writeUnavailableWarning: () => {
      if (options.getIsForeground()) {
        writeTerminalOutput(options.pane.terminal, RESTORE_UNAVAILABLE_WARNING, {
          foreground: true,
          beforeWrite: options.beforeTerminalWrite
        })
      }
    },
    discardTerminalOutput: options.discardTerminalOutput,
    warnIterationCap: (ptyId, reason) => {
      warnTerminalLifecycleAnomaly('hidden output restore hit its iteration cap', {
        tabId: options.tabId,
        worktreeId: options.worktreeId,
        leafId: options.pane.leafId,
        paneId: options.pane.id,
        ptyId,
        reason
      })
    }
  })
}

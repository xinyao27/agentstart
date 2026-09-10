import {
  TerminalAgentPhase as ProtocolAgentPhase,
  TerminalPresentation,
  TerminalRestoreKind,
  TerminalStartupCommandDelivery,
  TerminalState,
  TerminalSurface,
  type TerminalCreate as ProtocolCreate,
  type TerminalSummary as ProtocolSummary
} from '../../generated/agent_start/runtime/v1/terminal_pb.js'
import { safeInteger } from './request-values.js'
import type {
  TerminalAgentPhase,
  TerminalCreate,
  TerminalCreateInput,
  TerminalSummary
} from './types.js'

export function terminalSummary(summary: ProtocolSummary): TerminalSummary {
  return {
    ...(summary.agentPhase === undefined ? {} : { agentPhase: agentPhase(summary.agentPhase) }),
    handle: summary.handle,
    ptyId: summary.ptyId ?? null,
    worktreeId: summary.worktreeId,
    worktreePath: summary.worktreePath,
    branch: summary.branch,
    tabId: summary.tabId,
    leafId: summary.leafId,
    title: summary.title ?? null,
    connected: summary.connected,
    writable: summary.writable,
    lastOutputAt:
      summary.lastOutputAt === undefined
        ? null
        : safeInteger(summary.lastOutputAt, 'Terminal output timestamp'),
    preview: summary.preview
  }
}

export function terminalCreate(terminal: ProtocolCreate): TerminalCreate {
  if (!terminal.restore) {
    throw new TypeError('Terminal creation response is missing restore state')
  }
  const restore = terminal.restore
  return {
    handle: terminal.handle,
    tabId: terminal.tabId,
    paneKey: terminal.paneKey,
    ptyId: terminal.ptyId,
    worktreeId: terminal.worktreeId,
    title: terminal.title ?? null,
    surface: terminalSurface(terminal.surface),
    ...(terminal.warning === undefined ? {} : { warning: terminal.warning }),
    transportGeneration: terminal.transportGeneration,
    isReattach: terminal.isReattach,
    sessionExpired: terminal.sessionExpired,
    restore: {
      kind: restoreKind(restore.kind),
      isAlternateScreen: restore.isAlternateScreen,
      ...(restore.snapshotCols === undefined ? {} : { snapshotCols: restore.snapshotCols }),
      ...(restore.snapshotRows === undefined ? {} : { snapshotRows: restore.snapshotRows }),
      ...(restore.cwd === undefined ? {} : { cwd: restore.cwd }),
      ...(restore.startupCwdFallback
        ? { startupCwdFallback: { kind: 'worktree' as const, cwd: restore.startupCwdFallback.cwd } }
        : {})
    }
  }
}

export function terminalState(value: TerminalState): 'running' | 'exited' | 'unknown' {
  switch (value) {
    case TerminalState.RUNNING:
      return 'running'
    case TerminalState.EXITED:
      return 'exited'
    case TerminalState.UNKNOWN:
      return 'unknown'
    case TerminalState.UNSPECIFIED:
      throw new TypeError('Terminal state is unspecified')
  }
}

function terminalSurface(value: TerminalSurface): 'background' | 'visible' {
  switch (value) {
    case TerminalSurface.BACKGROUND:
      return 'background'
    case TerminalSurface.VISIBLE:
      return 'visible'
    case TerminalSurface.UNSPECIFIED:
      throw new TypeError('Terminal surface is unspecified')
  }
}

function restoreKind(value: TerminalRestoreKind): 'none' | 'snapshot' | 'replay' | 'cold-restore' {
  switch (value) {
    case TerminalRestoreKind.NONE:
      return 'none'
    case TerminalRestoreKind.SNAPSHOT:
      return 'snapshot'
    case TerminalRestoreKind.REPLAY:
      return 'replay'
    case TerminalRestoreKind.COLD_RESTORE:
      return 'cold-restore'
    case TerminalRestoreKind.UNSPECIFIED:
      throw new TypeError('Terminal restore kind is unspecified')
  }
}

export function startupDelivery(
  value: TerminalCreateInput['startupCommandDelivery']
): TerminalStartupCommandDelivery {
  switch (value) {
    case undefined:
      return TerminalStartupCommandDelivery.UNSPECIFIED
    case 'fast':
      return TerminalStartupCommandDelivery.FAST
    case 'shell-ready':
      return TerminalStartupCommandDelivery.SHELL_READY
  }
}

export function presentation(value: TerminalCreateInput['presentation']): TerminalPresentation {
  switch (value) {
    case undefined:
      return TerminalPresentation.UNSPECIFIED
    case 'background':
      return TerminalPresentation.BACKGROUND
    case 'visible':
      return TerminalPresentation.VISIBLE
    case 'focused':
      return TerminalPresentation.FOCUSED
  }
}

function agentPhase(value: ProtocolAgentPhase): TerminalAgentPhase {
  switch (value) {
    case ProtocolAgentPhase.THINKING:
      return 'thinking'
    case ProtocolAgentPhase.EXECUTING:
      return 'executing'
    case ProtocolAgentPhase.WAITING_DECISION:
      return 'waiting-decision'
    case ProtocolAgentPhase.COMPLETE:
      return 'complete'
    case ProtocolAgentPhase.UNSPECIFIED:
      throw new TypeError('Terminal agent phase is unspecified')
  }
}

import type { TerminalPaneSplitSource } from '@agentstart/protocol/telemetry/education'
import { parseRuntimePtyId } from '@agentstart/protocol/terminal-identity'
import type { TerminalPaneLayoutNode } from '@agentstart/protocol/workspace/session'

import { readProjectCatalogRuntimeState } from '../project-catalog/runtime-state'
import { getRuntimeEnvironmentIdForWorktree } from '../worktree/runtime-owner'
import { isRemoteRuntimeSessionActive } from './remote-runtime-session-environment'
import { reserveRemoteRuntimeSplitMirrorTelemetry } from './remote-runtime-split-telemetry'
import { isRemoteTerminalSurfaceTabId, toHostSessionTabId } from './remote-terminal-surface-id'
import { requireSessionTabsClient } from './session-tabs-target'
import { openRuntimeTerminalClient } from './terminal-protocol'
import { toRuntimeWorktreeSelector } from './worktree-selector'

export function splitRemoteRuntimeTerminal(
  ptyId: string | null | undefined,
  direction: 'horizontal' | 'vertical',
  telemetrySource: TerminalPaneSplitSource
): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isRemoteRuntimeSessionActive(environmentId)) {
    return false
  }
  // Why: paired splits must execute on the host pane; a local split would be
  // mirrored back as a separate tab instead of preserving pane geometry.
  const releaseMirrorSuppression = reserveRemoteRuntimeSplitMirrorTelemetry(ptyId, direction)
  void openRuntimeTerminalClient({ kind: 'environment', environmentId })
    .then((client) =>
      client.split({ terminal: remote.handle, direction, telemetrySource }, { timeoutMs: 15_000 })
    )
    .catch((error) => {
      releaseMirrorSuppression()
      logRemoteRuntimeTerminalFailure('split terminal', error)
    })
  return true
}

export function closeRemoteRuntimeTerminal(ptyId: string | null | undefined): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isRemoteRuntimeSessionActive(environmentId)) {
    return false
  }
  // Why: the host owns the pane graph; close it there before a later snapshot
  // can resurrect the locally detached mirror.
  void openRuntimeTerminalClient({ kind: 'environment', environmentId })
    .then((client) => client.close(remote.handle, { timeoutMs: 15_000 }))
    .catch((error) => logRemoteRuntimeTerminalFailure('close terminal pane', error))
  return true
}

export async function updateRemoteRuntimePaneLayout(args: {
  worktreeId: string
  tabId: string
  root: TerminalPaneLayoutNode | null
  expandedLeafId: string | null
  titlesByLeafId?: Record<string, string>
}): Promise<boolean> {
  const environmentId = getRuntimeEnvironmentIdForWorktree(
    readProjectCatalogRuntimeState(),
    args.worktreeId
  )
  if (!environmentId || !isRemoteRuntimeSessionActive(environmentId)) {
    return false
  }
  const hostTabId = isRemoteTerminalSurfaceTabId(args.tabId)
    ? toHostSessionTabId(args.tabId)
    : args.tabId
  try {
    await requireSessionTabsClient({ kind: 'environment', environmentId }).then((client) =>
      client.updatePaneLayout(
        {
          worktree: toRuntimeWorktreeSelector(args.worktreeId),
          tabId: hostTabId,
          root: args.root,
          expandedLeafId: args.expandedLeafId,
          ...(args.titlesByLeafId ? { titlesByLeafId: args.titlesByLeafId } : {})
        },
        { timeoutMs: 15_000 }
      )
    )
    return true
  } catch (error) {
    logRemoteRuntimeTerminalFailure('update pane layout', error)
    return false
  }
}

export function clearRemoteRuntimeTerminalBuffer(ptyId: string | null | undefined): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isRemoteRuntimeSessionActive(environmentId)) {
    return false
  }
  // Why: local clear is undone when the next host snapshot replays its buffer.
  void openRuntimeTerminalClient({ kind: 'environment', environmentId })
    .then((client) => client.clearBuffer(remote.handle, { timeoutMs: 15_000 }))
    .catch((error) => logRemoteRuntimeTerminalFailure('clear terminal buffer', error))
  return true
}

function logRemoteRuntimeTerminalFailure(action: string, error: unknown): void {
  console.warn(
    `[remote-runtime-session] failed to ${action}:`,
    error instanceof Error ? error.message : String(error)
  )
}

// Renderer-side liveness reconciliation for terminal panes whose daemon PTY
// session was reaped while the worktree was surface-hidden. On visibility
// resume the missed `pty:exit` left the pane mounted bound to a dead session;
// this routes such panes through the same exit teardown an observed exit runs.
// See design-docs/terminal-dead-pane-on-bg-exit.md.

import { isRuntimePtyId } from '@agentstart/protocol/terminal-identity'

export type HasPty = (ptyId: string) => Promise<boolean | null>

/**
 * PURE decision: should the pane bound to `ptyId` be reconciled (torn down)
 * given the resolved set of live session ids?
 *
 * Reconcile ONLY when every guard passes:
 * - `ptyId` is non-null (a mid-spawn pane has no id to prove dead).
 * - `ptyId` is not runtime-owned (runtime liveness is owned by the
 *   host snapshot, not `listSessions`).
 * - `connectionId === null` — the id is local/daemon-backed. SSH-backed ids
 *   (non-null connectionId) are deferred: the flat `listSessions` shape cannot
 *   authoritatively prove an SSH session gone (see design Section 1).
 * - the id is genuinely absent from the resolved live set.
 */
export function shouldReconcileDeadSession(args: {
  ptyId: string | null | undefined
  connectionId: string | null | undefined
  liveSessionIds: Set<string>
  ptyBoundAt?: number | null
  snapshotRequestedAt?: number | null
}): boolean {
  const { ptyId, connectionId, liveSessionIds, ptyBoundAt, snapshotRequestedAt } = args
  if (ptyId === null || ptyId === undefined) {
    return false
  }
  if (isRuntimePtyId(ptyId)) {
    return false
  }
  // Why: only local/daemon-backed ids (connectionId null/undefined) are
  // reconcilable; a non-null connectionId means SSH, which is deferred.
  if (connectionId !== null && connectionId !== undefined) {
    return false
  }
  // Why: a snapshot requested before this binding existed can't prove it dead
  // (newborn-PTY reconcile race). Omitting either timestamp keeps prior
  // pure-membership behavior (back-compat).
  if (
    typeof ptyBoundAt === 'number' &&
    typeof snapshotRequestedAt === 'number' &&
    ptyBoundAt >= snapshotRequestedAt
  ) {
    return false
  }
  return !liveSessionIds.has(ptyId)
}

export function shouldReconcileMissingSession(args: {
  ptyId: string | null | undefined
  connectionId: string | null | undefined
  isLive: boolean | null | undefined
  ptyBoundAt?: number | null
  livenessRequestedAt?: number | null
}): boolean {
  if (args.isLive !== false) {
    return false
  }
  return shouldReconcileDeadSession({
    ptyId: args.ptyId,
    connectionId: args.connectionId,
    liveSessionIds: new Set(),
    ptyBoundAt: args.ptyBoundAt,
    snapshotRequestedAt: args.livenessRequestedAt
  })
}

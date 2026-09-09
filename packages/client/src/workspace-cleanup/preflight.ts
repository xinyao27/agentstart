import type { WorkspaceCleanupCandidate } from '@yiru/protocol'
import {
  canQueueWorkspaceCleanupCandidate,
  shouldForceWorkspaceCleanupRemoval
} from '@yiru/protocol/workspace/cleanup-policy'
import { translate } from '~renderer/i18n/i18n'
import { scanWorkspaceCleanup as scanRuntimeWorkspaceCleanup } from '~renderer/runtime/workspace-cleanup-client'
import type { AppState } from '~renderer/store/types'

import { enrichWorkspaceCleanupCandidates } from './enrichment'
import type { WorkspaceCleanupFailure } from './types'

const WORKSPACE_CLEANUP_CONCRETE_RISK_BLOCKERS = ['dirty-files', 'unpushed-commits'] as const

export async function preflightWorkspaceCleanupCandidate(
  worktreeId: string,
  getState: () => AppState,
  approvedCandidate?: WorkspaceCleanupCandidate
): Promise<
  | { ok: true; candidate: WorkspaceCleanupCandidate }
  | { ok: false; failure: WorkspaceCleanupFailure }
> {
  const scan = await scanRuntimeWorkspaceCleanup({ worktreeId })
  const [candidate] = await enrichWorkspaceCleanupCandidates(scan.candidates, getState(), {
    applyDismissals: false
  })
  if (!candidate) {
    return {
      ok: false,
      failure: {
        worktreeId,
        displayName: worktreeId,
        message: translate(
          'auto.store.slices.workspace.cleanup.9d6e531da6',
          'Workspace no longer exists.'
        )
      }
    }
  }
  if (!canQueueWorkspaceCleanupCandidate(candidate)) {
    return {
      ok: false,
      failure: {
        worktreeId,
        displayName: candidate.displayName,
        message: candidate.blockers.length
          ? candidate.blockers.join(', ')
          : 'Workspace needs another look before removal.'
      }
    }
  }
  // Why: this row may be removed minutes after the confirm click. If it now
  // needs a force removal the user never approved (new dirt, unpushed work,
  // or a git error since confirmation), fail it instead of force-deleting.
  if (approvedCandidate) {
    const escalatedToForce =
      shouldForceWorkspaceCleanupRemoval(candidate) &&
      !shouldForceWorkspaceCleanupRemoval(approvedCandidate)
    // Why: an approved row that was already force-flagged for an unverifiable
    // reason must still fail when real dirt/unpushed work is now visible.
    const revealedConcreteRisk = WORKSPACE_CLEANUP_CONCRETE_RISK_BLOCKERS.some(
      (blocker) =>
        candidate.blockers.includes(blocker) && !approvedCandidate.blockers.includes(blocker)
    )
    if (escalatedToForce || revealedConcreteRisk) {
      return {
        ok: false,
        failure: {
          worktreeId,
          displayName: candidate.displayName,
          message: translate(
            'auto.store.slices.workspace.cleanup.changedSinceConfirmation',
            'Workspace changed after confirmation. Refresh to review it before removing.'
          )
        }
      }
    }
  }
  return { ok: true, candidate }
}

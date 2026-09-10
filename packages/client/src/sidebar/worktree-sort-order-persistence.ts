import { parseExecutionHostId } from '@agentstart/protocol/host/identity'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { persistRuntimeWorktreeSortOrder } from '~renderer/runtime/worktree-lifecycle-target'
import type { WorktreeRuntimeOwnerState } from '~renderer/worktree/runtime-owner'

import { splitWorktreeSortOrderByHost } from './worktree-sort-order-host-split'

function ignoreSortOrderPersistenceFailure(promise: Promise<unknown>): void {
  void promise.catch(() => {
    // Why: sort-order restore is best-effort; SSH disconnects during smart sort
    // must not surface as unhandled rejections that pollute crash diagnostics.
  })
}

export function persistWorktreeSortOrderByHost(
  state: WorktreeRuntimeOwnerState,
  orderedIds: readonly string[]
): void {
  for (const group of splitWorktreeSortOrderByHost(state, orderedIds)) {
    const parsed = parseExecutionHostId(group.hostId)
    if (parsed?.kind === 'runtime') {
      ignoreSortOrderPersistenceFailure(
        persistRuntimeWorktreeSortOrder(
          { kind: 'environment', environmentId: parsed.environmentId },
          { orderedIds: group.orderedIds }
        )
      )
      continue
    }

    ignoreSortOrderPersistenceFailure(
      workspaceHostClient.worktrees.persistSortOrder({ orderedIds: group.orderedIds })
    )
  }
}

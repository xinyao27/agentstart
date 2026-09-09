import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { createWorktreeActivationActions } from './activation-actions'
import { createWorktreeActivityActions } from './activity-actions'
import { createWorktreeCreateActions } from './create-actions'
import { createWorktreeDeleteStateActions } from './delete-state-actions'
import { createWorktreeFolderActivationActions } from './folder-activation-actions'
import { createWorktreeHydrationPurgeActions } from './hydration-purge'
import { createWorktreeIdentityActions } from './identity-actions'
import { createWorktreeLineageActions } from './lineage-actions'
import { createWorktreeMetaActions } from './meta-actions'
import { createWorktreeMetaBatchActions } from './meta-batch-actions'
import { createWorktreePendingCreationActions } from './pending-creation-actions'
import { createWorktreeRecoveryActions } from './recovery-actions'
import { createWorktreeRemoveActions } from './remove-actions'
import type { WorktreeSlice } from './types'
export type { WorktreeSlice, WorktreeDeleteState } from './types'

// Why: old runtime hosts only have `worktree.list`; preserve the large-list
// UI hydration parity this slice used before `worktree.detectedList` existed.
export const createWorktreeSlice: StateCreator<AppState, [], [], WorktreeSlice> = (set, get) => ({
  worktreesByRepo: {},
  detectedWorktreesByRepo: {},
  worktreeLineageById: {},
  workspaceLineageByChildKey: {},
  activeWorktreeId: null,
  activeWorkspaceKey: null,
  pendingWorktreeCreations: {},
  activePendingCreationId: null,
  renamingWorktreeId: null,
  deleteStateByWorktreeId: {},
  baseStatusByWorktreeId: {},
  sortEpoch: 0,
  everActivatedWorktreeIds: new Set<string>(),
  lastVisitedAtByWorktreeId: {},
  hasHydratedWorktreePurge: false,

  ...createWorktreeHydrationPurgeActions(set, get),

  ...createWorktreeLineageActions(set, get),
  ...createWorktreeCreateActions(set, get),
  ...createWorktreePendingCreationActions(set, get),
  ...createWorktreeRemoveActions(set, get),

  ...createWorktreeDeleteStateActions(set, get),
  ...createWorktreeMetaActions(set, get),
  ...createWorktreeMetaBatchActions(set, get),
  ...createWorktreeActivityActions(set, get),
  ...createWorktreeActivationActions(set, get),
  ...createWorktreeRecoveryActions(set, get),
  ...createWorktreeFolderActivationActions(set, get),

  ...createWorktreeIdentityActions(set)
})

import type { WorktreeSetPatch, ClientEventsSubscriptionEventValue } from '@yiru/protocol'

import { requireClientEventsClient } from './client-events-target'
import { createRuntimeStreamFanOut } from './stream-fan-out'
import type { WorktreeWorkspaceApi } from './workspace-host-api'
import {
  createRuntimeWorktree,
  detectedListRuntimeWorktrees,
  forceDeleteRuntimeWorktreeBranch,
  listRuntimeWorktreeLineage,
  listRuntimeWorktrees,
  persistRuntimeWorktreeSortOrder,
  prefetchRuntimeWorktreeCreateBase,
  removeRuntimeWorktree,
  resolveRuntimeWorktreePrBase,
  setRuntimeWorktree,
  subscribeRuntimeWorktreeStateEvents
} from './worktree-lifecycle-target'
import { toRuntimeWorktreeSelector } from './worktree-selector'

const LOCAL_TARGET = { kind: 'local' } as const

const localClientEvents = createRuntimeStreamFanOut<
  Awaited<ReturnType<typeof requireClientEventsClient>>,
  ClientEventsSubscriptionEventValue
>({
  resolveClient: async () => requireClientEventsClient(LOCAL_TARGET),
  open: (client, signal) => client.subscribe({ signal }).then((stream) => stream.events)
})
const localStateEvents = createRuntimeStreamFanOut({
  resolveClient: async () => LOCAL_TARGET,
  open: (target, signal) => subscribeRuntimeWorktreeStateEvents(target, signal)
})

const localWorktreeClient: WorktreeWorkspaceApi = {
  list: async ({ repoId }) =>
    (await listRuntimeWorktrees(LOCAL_TARGET, { repo: repoId })).worktrees,
  listDetected: (args) => detectedListRuntimeWorktrees(LOCAL_TARGET, { repo: args.repoId }),
  create: (args) =>
    createRuntimeWorktree(LOCAL_TARGET, {
      repo: args.repoId,
      expectedRevision: args.expectedRevision,
      name: args.name,
      baseBranch: args.baseBranch,
      compareBaseRef: args.compareBaseRef,
      branchNameOverride: args.branchNameOverride,
      linkedPR: args.linkedPR,
      operationId: args.creationId,
      displayName: args.displayName,
      sparseCheckout: args.sparseCheckout,
      pushTarget: args.pushTarget,
      setupDecision: args.setupDecision,
      createdWithAgent: args.createdWithAgent,
      pendingFirstAgentMessageRename: args.pendingFirstAgentMessageRename,
      ...(args.startup
        ? {
            startupCommand: args.startup.command,
            ...(args.startup.env ? { startupEnv: args.startup.env } : {}),
            ...(args.startup.launchConfig
              ? { startupLaunchConfig: args.startup.launchConfig }
              : {}),
            ...(args.startup.startupCommandDelivery
              ? { startupCommandDelivery: args.startup.startupCommandDelivery }
              : {}),
            activate: true
          }
        : {}),
      parentWorkspace: args.parentWorkspace,
      workspaceStatus: args.workspaceStatus,
      manualOrder: args.manualOrder
    }),
  // Why: the Rust progress authority only streams clone progress, so this
  // adapter has nothing to forward; creation progress reaches the shell through
  // the worktree state-events stream.
  onCreateProgress: () => () => {},
  prefetchCreateBase: async ({ repoId, baseBranch }) => {
    await prefetchRuntimeWorktreeCreateBase(LOCAL_TARGET, { repo: repoId, baseBranch })
  },
  resolvePrBase: ({ repoId, ...input }) =>
    resolveRuntimeWorktreePrBase(LOCAL_TARGET, { repo: repoId, ...input }),
  remove: ({ expectedRevision, worktreeId, force, skipArchive }) =>
    removeRuntimeWorktree(LOCAL_TARGET, {
      expectedRevision,
      worktree: toRuntimeWorktreeSelector(worktreeId),
      force,
      runHooks: skipArchive !== true
    }),
  forceDeletePreservedBranch: ({ worktreeId, branchName, expectedHead }) =>
    forceDeleteRuntimeWorktreeBranch(LOCAL_TARGET, {
      worktree: toRuntimeWorktreeSelector(worktreeId),
      branchName,
      expectedHead
    }),
  updateMeta: ({ expectedRevision, worktreeId, updates }) => {
    const rpcUpdates =
      Object.prototype.hasOwnProperty.call(updates, 'pushTarget') &&
      updates.pushTarget === undefined
        ? { ...updates, pushTarget: null }
        : updates
    return setRuntimeWorktree(LOCAL_TARGET, {
      expectedRevision,
      worktree: toRuntimeWorktreeSelector(worktreeId),
      // Why: `WorktreeMeta` (workbench domain model) and `WorktreeSetPatch`
      // (protobuf wire patch) are independently declared but describe the
      // same patchable field set one-for-one; only the field the daemon's
      // `set` handler actually reads ever flows through here.
      patch: rpcUpdates as WorktreeSetPatch
    })
  },
  listLineage: () => listRuntimeWorktreeLineage(LOCAL_TARGET),
  persistSortOrder: async ({ orderedIds }) => {
    await persistRuntimeWorktreeSortOrder(LOCAL_TARGET, { orderedIds })
  },
  onChanged: (callback) =>
    localClientEvents.subscribe((event: ClientEventsSubscriptionEventValue) => {
      if (event.type === 'worktreesChanged') {
        callback({ repoId: event.repoId, ...(event.renamed ? { renamed: event.renamed } : {}) })
      }
    }),
  onGitStatusMetadataChanged: (callback) =>
    localClientEvents.subscribe((event: ClientEventsSubscriptionEventValue) => {
      if (event.type === 'worktreesChanged') {
        callback({ repoId: event.repoId })
      }
    }),
  onHeadIdentitiesChanged: (callback) =>
    localClientEvents.subscribe((event: ClientEventsSubscriptionEventValue) => {
      if (event.type === 'worktreeHeadIdentitiesChanged') {
        callback({ repoId: event.repoId, identities: event.identities })
      }
    }),
  onBaseStatus: (callback) =>
    localStateEvents.subscribe((event) => {
      if (event.type === 'baseStatus') {
        const { type: _type, ...payload } = event
        callback(payload)
      }
    })
}

export const worktreeHostClient: WorktreeWorkspaceApi = localWorktreeClient

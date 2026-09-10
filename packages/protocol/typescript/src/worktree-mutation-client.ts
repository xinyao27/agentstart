import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  WorktreeService,
  WorktreeServiceActivateRequestSchema,
  WorktreeServiceActivateResponseSchema,
  WorktreeServiceForceDeleteBranchRequestSchema,
  WorktreeServiceForceDeleteBranchResponseSchema,
  WorktreeServicePersistSortOrderRequestSchema,
  WorktreeServicePersistSortOrderResponseSchema,
  WorktreeServicePrefetchCreateBaseRequestSchema,
  WorktreeServiceRemoveRequestSchema,
  WorktreeServiceRemoveResponseSchema,
  WorktreeServiceResolvePrBaseRequestSchema,
  WorktreeServiceResolvePrBaseResponseSchema,
  WorktreeServiceSetRequestSchema,
  WorktreeServiceSetResponseSchema,
  WorktreeServiceSleepRequestSchema,
  WorktreeServiceSleepResponseSchema
} from '../generated/agent_start/runtime/v1/worktree_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'
import {
  worktreeActivateResult,
  worktreeRemoveResult,
  worktreeResolvePrBaseResult,
  worktreeSetPatchValue
} from './worktree-mutation-values.js'
import type {
  WorktreeActivateInput,
  WorktreeActivateResult,
  WorktreeForceDeleteBranchInput,
  WorktreeForceDeleteBranchResult,
  WorktreePersistSortOrderResult,
  WorktreePrBaseResult,
  WorktreePrefetchCreateBaseInput,
  WorktreeRemoveInput,
  WorktreeRemoveResult,
  WorktreeResolvePrBaseInput,
  WorktreeSetInput,
  WorktreeShowResult,
  WorktreeSleepResult
} from './worktree-operation-types.js'
import { worktreeValue } from './worktree-record-values.js'

const procedure = <K extends keyof typeof WorktreeService.method>(name: K) =>
  `/${WorktreeService.typeName}/${WorktreeService.method[name].name}`

export async function worktreeSleep(
  transport: RuntimeTransport,
  input: { worktree: string },
  options?: RuntimeCallOptions
): Promise<WorktreeSleepResult> {
  const response = fromBinary(
    WorktreeServiceSleepResponseSchema,
    await call(
      transport,
      procedure('sleep'),
      WorktreeServiceSleepRequestSchema,
      { worktree: required(input.worktree, 'Worktree selector') },
      options
    )
  )
  return { worktreeId: required(response.worktreeId, 'Worktree ID') }
}

export async function worktreeActivate(
  transport: RuntimeTransport,
  input: WorktreeActivateInput,
  options?: RuntimeCallOptions
): Promise<WorktreeActivateResult> {
  const response = fromBinary(
    WorktreeServiceActivateResponseSchema,
    await call(
      transport,
      procedure('activate'),
      WorktreeServiceActivateRequestSchema,
      {
        worktree: required(input.worktree, 'Worktree selector'),
        notifyClients: input.notifyClients ?? true
      },
      options
    )
  )
  return worktreeActivateResult(response)
}

export async function worktreePrefetchCreateBase(
  transport: RuntimeTransport,
  input: WorktreePrefetchCreateBaseInput,
  options?: RuntimeCallOptions
): Promise<null> {
  await call(
    transport,
    procedure('prefetchCreateBase'),
    WorktreeServicePrefetchCreateBaseRequestSchema,
    {
      repo: required(input.repo, 'Repository selector'),
      ...(input.baseBranch ? { baseBranch: input.baseBranch } : {})
    },
    options
  )
  return null
}

export async function worktreeResolvePrBase(
  transport: RuntimeTransport,
  input: WorktreeResolvePrBaseInput,
  options?: RuntimeCallOptions
): Promise<WorktreePrBaseResult> {
  const response = fromBinary(
    WorktreeServiceResolvePrBaseResponseSchema,
    await call(
      transport,
      procedure('resolvePrBase'),
      WorktreeServiceResolvePrBaseRequestSchema,
      {
        repo: required(input.repo, 'Repository selector'),
        prNumber: prNumber(input.prNumber),
        isCrossRepository: input.isCrossRepository ?? false,
        ...(input.headRefName ? { headRefName: input.headRefName } : {}),
        ...(input.baseRefName ? { baseRefName: input.baseRefName } : {})
      },
      options
    )
  )
  return worktreeResolvePrBaseResult(response)
}

export async function worktreeRemove(
  transport: RuntimeTransport,
  input: WorktreeRemoveInput,
  options?: RuntimeCallOptions
): Promise<WorktreeRemoveResult> {
  const response = fromBinary(
    WorktreeServiceRemoveResponseSchema,
    await call(
      transport,
      procedure('remove'),
      WorktreeServiceRemoveRequestSchema,
      {
        worktree: required(input.worktree, 'Worktree selector'),
        expectedRevision: revision(input.expectedRevision),
        force: input.force ?? false,
        runHooks: input.runHooks ?? false
      },
      options
    )
  )
  return worktreeRemoveResult(response)
}

export async function worktreeForceDeleteBranch(
  transport: RuntimeTransport,
  input: WorktreeForceDeleteBranchInput,
  options?: RuntimeCallOptions
): Promise<WorktreeForceDeleteBranchResult> {
  const response = fromBinary(
    WorktreeServiceForceDeleteBranchResponseSchema,
    await call(
      transport,
      procedure('forceDeleteBranch'),
      WorktreeServiceForceDeleteBranchRequestSchema,
      {
        worktree: required(input.worktree, 'Worktree selector'),
        branchName: required(input.branchName, 'Branch name'),
        expectedHead: required(input.expectedHead, 'Expected branch head')
      },
      options
    )
  )
  if (!response.deleted) {
    throw new TypeError('Worktree branch delete did not complete')
  }
  return { deleted: true }
}

export async function worktreeSet(
  transport: RuntimeTransport,
  input: WorktreeSetInput,
  options?: RuntimeCallOptions
): Promise<WorktreeShowResult> {
  const response = fromBinary(
    WorktreeServiceSetResponseSchema,
    await call(
      transport,
      procedure('set'),
      WorktreeServiceSetRequestSchema,
      {
        worktree: required(input.worktree, 'Worktree selector'),
        expectedRevision: revision(input.expectedRevision),
        patch: worktreeSetPatchValue(input.patch)
      },
      options
    )
  )
  return {
    worktree: worktreeValue(requiredValue(response.worktree, 'Updated worktree')),
    revision: number(response.revision)
  }
}

export async function worktreePersistSortOrder(
  transport: RuntimeTransport,
  input: { orderedIds: string[] },
  options?: RuntimeCallOptions
): Promise<WorktreePersistSortOrderResult> {
  const response = fromBinary(
    WorktreeServicePersistSortOrderResponseSchema,
    await call(
      transport,
      procedure('persistSortOrder'),
      WorktreeServicePersistSortOrderRequestSchema,
      { orderedIds: input.orderedIds },
      options
    )
  )
  return { updated: response.updated }
}

function call(
  transport: RuntimeTransport,
  method: string,
  schema: Parameters<typeof toBinary>[0],
  value: Parameters<typeof create>[1],
  options?: RuntimeCallOptions
): Promise<Uint8Array> {
  return transport.unary({
    method,
    payload: toBinary(schema, create(schema, value)),
    ...(options ? { options } : {})
  })
}

function revision(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Expected worktree revision must be a nonnegative safe integer')
  }
  return BigInt(value)
}

function number(value: bigint): number {
  const output = Number(value)
  if (!Number.isSafeInteger(output)) {
    throw new TypeError('Worktree revision is unsafe')
  }
  return output
}

function prNumber(value: number): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('Pull request number must be a positive safe integer')
  }
  return BigInt(value)
}

function required(value: string, label: string): string {
  if (!value) {
    throw new TypeError(`${label} must not be empty`)
  }
  return value
}

function requiredValue<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new TypeError(`${label} is missing`)
  }
  return value
}

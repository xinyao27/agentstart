import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  WorktreeService,
  WorktreeServiceArchiveRequestSchema,
  WorktreeServiceArchiveResponseSchema,
  WorktreeServiceCreateRequestSchema,
  WorktreeServiceCreateResponseSchema,
  WorktreeServiceListArchivesRequestSchema,
  WorktreeServiceListArchivesResponseSchema,
  WorktreeServiceListRequestSchema,
  WorktreeServiceListResponseSchema,
  WorktreeServiceRestoreRequestSchema,
  WorktreeServiceRestoreResponseSchema
} from '../generated/yiru/runtime/v1/worktree_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'
import {
  worktreeActivate,
  worktreeForceDeleteBranch,
  worktreePersistSortOrder,
  worktreePrefetchCreateBase,
  worktreeRemove,
  worktreeResolvePrBase,
  worktreeSet,
  worktreeSleep
} from './worktree-mutation-client.js'
import type {
  WorktreeActivateInput,
  WorktreeActivateResult,
  WorktreeDetectedListResult,
  WorktreeForceDeleteBranchInput,
  WorktreeForceDeleteBranchResult,
  WorktreeLineageListResult,
  WorktreePersistSortOrderResult,
  WorktreePrBaseResult,
  WorktreePrefetchCreateBaseInput,
  WorktreePsResult,
  WorktreeRemoveInput,
  WorktreeRemoveResult,
  WorktreeResolvePrBaseInput,
  WorktreeSetInput,
  WorktreeShowResult,
  WorktreeSleepResult
} from './worktree-operation-types.js'
import {
  worktreeBranchRenameFailureOutput,
  worktreeDetectedList,
  worktreeLineageList,
  worktreePs,
  worktreeShow
} from './worktree-query-client.js'
import { worktreeValue } from './worktree-record-values.js'
import { worktreeArchiveValue, worktreeCreateResult } from './worktree-result-values.js'
import {
  subscribeWorktreeStateEvents,
  type WorktreeStateEventSubscription
} from './worktree-state-client.js'
import type {
  WorktreeArchiveValue,
  WorktreeCreateInput,
  WorktreeCreateResult,
  WorktreeListResult
} from './worktree-types.js'

const procedure = <K extends keyof typeof WorktreeService.method>(name: K) =>
  `/${WorktreeService.typeName}/${WorktreeService.method[name].name}`

export class WorktreeClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async archive(
    input: { worktree: string; expectedRevision: number; deleteBranch?: boolean },
    options?: RuntimeCallOptions
  ): Promise<{ archive: WorktreeArchiveValue; revision: number }> {
    const response = fromBinary(
      WorktreeServiceArchiveResponseSchema,
      await this.call(
        procedure('archive'),
        WorktreeServiceArchiveRequestSchema,
        {
          worktree: required(input.worktree, 'Worktree selector'),
          expectedRevision: revision(input.expectedRevision),
          deleteBranch: input.deleteBranch ?? false
        },
        options
      )
    )
    return {
      archive: worktreeArchiveValue(requiredValue(response.archive, 'Created archive')),
      revision: number(response.revision)
    }
  }

  async list(
    input: { repo?: string; limit?: number } = {},
    options?: RuntimeCallOptions
  ): Promise<WorktreeListResult> {
    const response = fromBinary(
      WorktreeServiceListResponseSchema,
      await this.call(procedure('list'), WorktreeServiceListRequestSchema, input, options)
    )
    return {
      worktrees: response.worktrees.map(worktreeValue),
      totalCount: response.totalCount,
      truncated: response.truncated
    }
  }

  async create(
    input: WorktreeCreateInput,
    options?: RuntimeCallOptions
  ): Promise<WorktreeCreateResult> {
    validateCreate(input)
    const linkedPr =
      input.linkedPR === undefined
        ? undefined
        : input.linkedPR === null
          ? { value: { case: 'null' as const, value: true } }
          : { value: { case: 'number' as const, value: revision(input.linkedPR) } }
    const response = fromBinary(
      WorktreeServiceCreateResponseSchema,
      await this.call(
        procedure('create'),
        WorktreeServiceCreateRequestSchema,
        {
          ...input,
          repo: required(input.repo, 'Repository selector'),
          expectedRevision: revision(input.expectedRevision),
          ...(linkedPr ? { linkedPr } : {})
        },
        options
      )
    )
    return worktreeCreateResult(response)
  }

  async listArchives(
    input: { repo?: string } = {},
    options?: RuntimeCallOptions
  ): Promise<{ archives: WorktreeArchiveValue[] }> {
    const response = fromBinary(
      WorktreeServiceListArchivesResponseSchema,
      await this.call(
        procedure('listArchives'),
        WorktreeServiceListArchivesRequestSchema,
        input,
        options
      )
    )
    return { archives: response.archives.map(worktreeArchiveValue) }
  }

  async restore(
    input: { archive: string; expectedRevision: number },
    options?: RuntimeCallOptions
  ): Promise<{ archive: WorktreeArchiveValue; revision: number }> {
    const response = fromBinary(
      WorktreeServiceRestoreResponseSchema,
      await this.call(
        procedure('restore'),
        WorktreeServiceRestoreRequestSchema,
        {
          archive: required(input.archive, 'Archive ID'),
          expectedRevision: revision(input.expectedRevision)
        },
        options
      )
    )
    return {
      archive: worktreeArchiveValue(requiredValue(response.archive, 'Restored archive')),
      revision: number(response.revision)
    }
  }

  ps(input: { limit?: number } = {}, options?: RuntimeCallOptions): Promise<WorktreePsResult> {
    return worktreePs(this.transport, input, options)
  }

  show(input: { worktree: string }, options?: RuntimeCallOptions): Promise<WorktreeShowResult> {
    return worktreeShow(this.transport, input, options)
  }

  sleep(input: { worktree: string }, options?: RuntimeCallOptions): Promise<WorktreeSleepResult> {
    return worktreeSleep(this.transport, input, options)
  }

  activate(
    input: WorktreeActivateInput,
    options?: RuntimeCallOptions
  ): Promise<WorktreeActivateResult> {
    return worktreeActivate(this.transport, input, options)
  }

  prefetchCreateBase(
    input: WorktreePrefetchCreateBaseInput,
    options?: RuntimeCallOptions
  ): Promise<null> {
    return worktreePrefetchCreateBase(this.transport, input, options)
  }

  resolvePrBase(
    input: WorktreeResolvePrBaseInput,
    options?: RuntimeCallOptions
  ): Promise<WorktreePrBaseResult> {
    return worktreeResolvePrBase(this.transport, input, options)
  }

  remove(input: WorktreeRemoveInput, options?: RuntimeCallOptions): Promise<WorktreeRemoveResult> {
    return worktreeRemove(this.transport, input, options)
  }

  forceDeleteBranch(
    input: WorktreeForceDeleteBranchInput,
    options?: RuntimeCallOptions
  ): Promise<WorktreeForceDeleteBranchResult> {
    return worktreeForceDeleteBranch(this.transport, input, options)
  }

  set(input: WorktreeSetInput, options?: RuntimeCallOptions): Promise<WorktreeShowResult> {
    return worktreeSet(this.transport, input, options)
  }

  persistSortOrder(
    input: { orderedIds: string[] },
    options?: RuntimeCallOptions
  ): Promise<WorktreePersistSortOrderResult> {
    return worktreePersistSortOrder(this.transport, input, options)
  }

  detectedList(
    input: { repo: string },
    options?: RuntimeCallOptions
  ): Promise<WorktreeDetectedListResult> {
    return worktreeDetectedList(this.transport, input, options)
  }

  lineageList(options?: RuntimeCallOptions): Promise<WorktreeLineageListResult> {
    return worktreeLineageList(this.transport, options)
  }

  branchRenameFailureOutput(
    input: { worktree: string },
    options?: RuntimeCallOptions
  ): Promise<string | null> {
    return worktreeBranchRenameFailureOutput(this.transport, input, options)
  }

  /**
   * Tail base-drift signals for every repo on the host. A routed transport
   * restarts the stream from scratch, so a caller does not need a resume
   * cursor the way `WorkspaceEventsClient.watch` does.
   */
  subscribeStateEvents(options?: RuntimeCallOptions): Promise<WorktreeStateEventSubscription> {
    return subscribeWorktreeStateEvents(this.transport, options)
  }

  private call(
    method: string,
    schema: Parameters<typeof toBinary>[0],
    value: Parameters<typeof create>[1],
    options?: RuntimeCallOptions
  ): Promise<Uint8Array> {
    return this.transport.unary({
      method,
      payload: toBinary(schema, create(schema, value)),
      ...(options ? { options } : {})
    })
  }
}

function validateCreate(input: WorktreeCreateInput): void {
  if ((input.parentWorkspace || input.parentWorktree) && input.noParent === true) {
    throw new TypeError('Choose either one parent selector or --no-parent.')
  }
  if (input.parentWorkspace && input.parentWorktree) {
    throw new TypeError('Choose either one parent selector or --no-parent.')
  }
  if (input.startupPrompt !== undefined && input.startupAgent === undefined) {
    throw new TypeError('startupPrompt requires startupAgent')
  }
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

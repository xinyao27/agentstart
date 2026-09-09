import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  WorktreeService,
  WorktreeServiceBranchRenameFailureOutputRequestSchema,
  WorktreeServiceBranchRenameFailureOutputResponseSchema,
  WorktreeServiceDetectedListRequestSchema,
  WorktreeServiceDetectedListResponseSchema,
  WorktreeServiceLineageListRequestSchema,
  WorktreeServiceLineageListResponseSchema,
  WorktreeServicePsRequestSchema,
  WorktreeServicePsResponseSchema,
  WorktreeServiceShowRequestSchema,
  WorktreeServiceShowResponseSchema
} from '../generated/yiru/runtime/v1/worktree_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'
import type {
  WorktreeDetectedListResult,
  WorktreeLineageListResult,
  WorktreePsResult,
  WorktreeShowResult
} from './worktree-operation-types.js'
import {
  worktreeDetectedListResult,
  worktreeLineageListResult,
  worktreePsResult,
  worktreeShowResult
} from './worktree-query-values.js'

const procedure = <K extends keyof typeof WorktreeService.method>(name: K) =>
  `/${WorktreeService.typeName}/${WorktreeService.method[name].name}`

export async function worktreePs(
  transport: RuntimeTransport,
  input: { limit?: number } = {},
  options?: RuntimeCallOptions
): Promise<WorktreePsResult> {
  const response = fromBinary(
    WorktreeServicePsResponseSchema,
    await call(transport, procedure('ps'), WorktreeServicePsRequestSchema, input, options)
  )
  return worktreePsResult(response)
}

export async function worktreeShow(
  transport: RuntimeTransport,
  input: { worktree: string },
  options?: RuntimeCallOptions
): Promise<WorktreeShowResult> {
  const response = fromBinary(
    WorktreeServiceShowResponseSchema,
    await call(
      transport,
      procedure('show'),
      WorktreeServiceShowRequestSchema,
      { worktree: required(input.worktree, 'Worktree selector') },
      options
    )
  )
  return worktreeShowResult(response)
}

export async function worktreeDetectedList(
  transport: RuntimeTransport,
  input: { repo: string },
  options?: RuntimeCallOptions
): Promise<WorktreeDetectedListResult> {
  const response = fromBinary(
    WorktreeServiceDetectedListResponseSchema,
    await call(
      transport,
      procedure('detectedList'),
      WorktreeServiceDetectedListRequestSchema,
      { repo: required(input.repo, 'Repository selector') },
      options
    )
  )
  return worktreeDetectedListResult(response)
}

export async function worktreeLineageList(
  transport: RuntimeTransport,
  options?: RuntimeCallOptions
): Promise<WorktreeLineageListResult> {
  const response = fromBinary(
    WorktreeServiceLineageListResponseSchema,
    await call(
      transport,
      procedure('lineageList'),
      WorktreeServiceLineageListRequestSchema,
      {},
      options
    )
  )
  return worktreeLineageListResult(response)
}

export async function worktreeBranchRenameFailureOutput(
  transport: RuntimeTransport,
  input: { worktree: string },
  options?: RuntimeCallOptions
): Promise<string | null> {
  const response = fromBinary(
    WorktreeServiceBranchRenameFailureOutputResponseSchema,
    await call(
      transport,
      procedure('branchRenameFailureOutput'),
      WorktreeServiceBranchRenameFailureOutputRequestSchema,
      { worktree: required(input.worktree, 'Worktree selector') },
      options
    )
  )
  return response.output ?? null
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

function required(value: string, label: string): string {
  if (!value) {
    throw new TypeError(`${label} must not be empty`)
  }
  return value
}

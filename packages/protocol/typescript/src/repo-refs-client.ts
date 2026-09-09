import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  RepoService,
  RepoServiceBaseRefDefaultRequestSchema,
  RepoServiceBaseRefDefaultResponseSchema,
  RepoServiceSearchRefsRequestSchema,
  RepoServiceSearchRefsResponseSchema
} from '../generated/yiru/runtime/v1/repo_pb.js'
import {
  baseRefDefault,
  searchRefs as searchRefsResult,
  type RepoBaseRefDefaultInput,
  type RepoBaseRefDefaultResult,
  type RepoSearchRefsInput,
  type RepoSearchRefsResult
} from './repo-refs-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const BASE_REF_DEFAULT = `/${RepoService.typeName}/${RepoService.method.baseRefDefault.name}`
const SEARCH_REFS = `/${RepoService.typeName}/${RepoService.method.searchRefs.name}`

export class RepoRefsClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async baseRefDefault(
    input: RepoBaseRefDefaultInput,
    options?: RuntimeCallOptions
  ): Promise<RepoBaseRefDefaultResult> {
    const response = fromBinary(
      RepoServiceBaseRefDefaultResponseSchema,
      await this.transport.unary({
        method: BASE_REF_DEFAULT,
        payload: toBinary(
          RepoServiceBaseRefDefaultRequestSchema,
          create(RepoServiceBaseRefDefaultRequestSchema, {
            repo: required(input.repo, 'Repository selector'),
            ...(input.hostId === undefined ? {} : { hostId: input.hostId })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return baseRefDefault(response)
  }

  async searchRefs(
    input: RepoSearchRefsInput,
    options?: RuntimeCallOptions
  ): Promise<RepoSearchRefsResult> {
    const response = fromBinary(
      RepoServiceSearchRefsResponseSchema,
      await this.transport.unary({
        method: SEARCH_REFS,
        payload: toBinary(
          RepoServiceSearchRefsRequestSchema,
          create(RepoServiceSearchRefsRequestSchema, {
            repo: required(input.repo, 'Repository selector'),
            query: input.query,
            ...(input.limit === undefined ? {} : { limit: input.limit }),
            ...(input.hostId === undefined ? {} : { hostId: input.hostId })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return searchRefsResult(response)
  }
}

export function required(value: string, label: string): string {
  if (value.length === 0) {
    throw new TypeError(`${label} must not be empty`)
  }
  return value
}

export function revisionInput(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Expected repository revision must be a nonnegative safe integer')
  }
  return BigInt(value)
}

export function revision(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError('Repository revision is outside the nonnegative safe integer range')
  }
  return number
}

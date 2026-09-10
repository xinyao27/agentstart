import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  RepoKind,
  RepoReorderStatus,
  RepoService,
  RepoServiceAddRequestSchema,
  RepoServiceAddResponseSchema,
  RepoServiceCloneRequestSchema,
  RepoServiceCloneResponseSchema,
  RepoServiceCreateRequestSchema,
  RepoServiceCreateResponseSchema,
  RepoServiceGitAvailableRequestSchema,
  RepoServiceGitAvailableResponseSchema,
  RepoServiceListRequestSchema,
  RepoServiceListResponseSchema,
  RepoServiceReorderRequestSchema,
  RepoServiceReorderResponseSchema,
  RepoServiceRmRequestSchema,
  RepoServiceRmResponseSchema,
  RepoServiceUpdateRequestSchema,
  RepoServiceUpdateResponseSchema
} from '../generated/agent_start/runtime/v1/repo_pb.js'
import { RepoPresetClient } from './repo-preset-client.js'
import { required, revision, revisionInput } from './repo-refs-client.js'
import type {
  RepoAddInput,
  RepoAddResult,
  RepoCloneInput,
  RepoCreateInput,
  RepoCreateResult,
  RepoListResult,
  RepoRemoveInput,
  RepoRemoveResult,
  RepoReorderInput,
  RepoReorderResult,
  RepoUpdateInput,
  RepoValue
} from './repo-types.js'
import { repoUpdateFields } from './repo-update-values.js'
import { repoValue } from './repo-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const LIST = `/${RepoService.typeName}/${RepoService.method.list.name}`
const ADD = `/${RepoService.typeName}/${RepoService.method.add.name}`
const CLONE = `/${RepoService.typeName}/${RepoService.method.clone.name}`
const CREATE = `/${RepoService.typeName}/${RepoService.method.create.name}`
const GIT_AVAILABLE = `/${RepoService.typeName}/${RepoService.method.gitAvailable.name}`
const REORDER = `/${RepoService.typeName}/${RepoService.method.reorder.name}`
const RM = `/${RepoService.typeName}/${RepoService.method.rm.name}`
const UPDATE = `/${RepoService.typeName}/${RepoService.method.update.name}`

export class RepoClient extends RepoPresetClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }

  async list(options?: RuntimeCallOptions): Promise<RepoListResult> {
    const response = fromBinary(
      RepoServiceListResponseSchema,
      await this.transport.unary({
        method: LIST,
        payload: toBinary(RepoServiceListRequestSchema, create(RepoServiceListRequestSchema)),
        ...(options ? { options } : {})
      })
    )
    return { repos: response.repos.map(repoValue), revision: revision(response.revision) }
  }

  async add(input: RepoAddInput, options?: RuntimeCallOptions): Promise<RepoAddResult> {
    const response = fromBinary(
      RepoServiceAddResponseSchema,
      await this.transport.unary({
        method: ADD,
        payload: toBinary(
          RepoServiceAddRequestSchema,
          create(RepoServiceAddRequestSchema, {
            expectedRevision: revisionInput(input.expectedRevision ?? 0),
            path: required(input.path, 'Repository path'),
            kind: protocolKind(input.kind),
            ...(input.hostId === undefined ? {} : { hostId: required(input.hostId, 'Host ID') })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { repo: requiredRepo(response.repo), revision: revision(response.revision) }
  }

  async clone(input: RepoCloneInput, options?: RuntimeCallOptions): Promise<RepoAddResult> {
    const response = fromBinary(
      RepoServiceCloneResponseSchema,
      await this.transport.unary({
        method: CLONE,
        payload: toBinary(
          RepoServiceCloneRequestSchema,
          create(RepoServiceCloneRequestSchema, {
            expectedRevision: revisionInput(input.expectedRevision),
            url: required(input.url, 'Clone URL'),
            destination: required(input.destination, 'Clone destination')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { repo: requiredRepo(response.repo), revision: revision(response.revision) }
  }

  async create(input: RepoCreateInput, options?: RuntimeCallOptions): Promise<RepoCreateResult> {
    const response = fromBinary(
      RepoServiceCreateResponseSchema,
      await this.transport.unary({
        method: CREATE,
        payload: toBinary(
          RepoServiceCreateRequestSchema,
          create(RepoServiceCreateRequestSchema, {
            expectedRevision: revisionInput(input.expectedRevision),
            parentPath: required(input.parentPath, 'Parent path'),
            name: required(input.name, 'Repository name'),
            kind: protocolKind(input.kind)
          })
        ),
        ...(options ? { options } : {})
      })
    )
    switch (response.result.case) {
      case 'success':
        return {
          repo: requiredRepo(response.result.value.repo),
          revision: revision(response.result.value.revision)
        }
      case 'error':
        return { error: response.result.value }
      case undefined:
        throw new TypeError('Repository creation response is missing a result')
    }
  }

  async gitAvailable(options?: RuntimeCallOptions): Promise<boolean> {
    const response = fromBinary(
      RepoServiceGitAvailableResponseSchema,
      await this.transport.unary({
        method: GIT_AVAILABLE,
        payload: toBinary(
          RepoServiceGitAvailableRequestSchema,
          create(RepoServiceGitAvailableRequestSchema)
        ),
        ...(options ? { options } : {})
      })
    )
    return response.available
  }

  async reorder(input: RepoReorderInput, options?: RuntimeCallOptions): Promise<RepoReorderResult> {
    const response = fromBinary(
      RepoServiceReorderResponseSchema,
      await this.transport.unary({
        method: REORDER,
        payload: toBinary(
          RepoServiceReorderRequestSchema,
          create(RepoServiceReorderRequestSchema, {
            expectedRevision: revisionInput(input.expectedRevision),
            orderedIds: [...input.orderedIds]
          })
        ),
        ...(options ? { options } : {})
      })
    )
    const status = reorderStatus(response.status)
    return { revision: revision(response.revision), status }
  }

  async rm(input: RepoRemoveInput, options?: RuntimeCallOptions): Promise<RepoRemoveResult> {
    const response = fromBinary(
      RepoServiceRmResponseSchema,
      await this.transport.unary({
        method: RM,
        payload: toBinary(
          RepoServiceRmRequestSchema,
          create(RepoServiceRmRequestSchema, {
            expectedRevision: revisionInput(input.expectedRevision),
            repo: required(input.repo, 'Repository selector')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { removed: response.removed, revision: revision(response.revision) }
  }

  async update(
    input: RepoRemoveInput & { updates: RepoUpdateInput },
    options?: RuntimeCallOptions
  ): Promise<RepoAddResult> {
    const response = fromBinary(
      RepoServiceUpdateResponseSchema,
      await this.transport.unary({
        method: UPDATE,
        payload: toBinary(
          RepoServiceUpdateRequestSchema,
          create(RepoServiceUpdateRequestSchema, {
            expectedRevision: revisionInput(input.expectedRevision),
            repo: required(input.repo, 'Repository selector'),
            updates: repoUpdateFields(input.updates)
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { repo: requiredRepo(response.repo), revision: revision(response.revision) }
  }
}

function protocolKind(value: RepoAddInput['kind']): RepoKind {
  switch (value) {
    case undefined:
    case 'git':
      return RepoKind.GIT
    case 'folder':
      return RepoKind.FOLDER
  }
  throw new TypeError('Repository kind must be git or folder')
}

function reorderStatus(value: RepoReorderStatus): RepoReorderResult['status'] {
  switch (value) {
    case RepoReorderStatus.APPLIED:
      return 'applied'
    case RepoReorderStatus.REJECTED:
      return 'rejected'
    case RepoReorderStatus.UNSPECIFIED:
      throw new TypeError('Repository reorder response status is missing')
  }
  throw new TypeError('Repository reorder response status is unknown')
}

function requiredRepo(value: Parameters<typeof repoValue>[0] | undefined): RepoValue {
  if (!value) {
    throw new TypeError('Repository response is missing the repository')
  }
  return repoValue(value)
}

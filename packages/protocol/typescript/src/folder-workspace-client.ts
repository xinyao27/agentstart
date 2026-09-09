import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  FolderWorkspaceService,
  FolderWorkspaceServiceCreateRequestSchema,
  FolderWorkspaceServiceDeleteRequestSchema,
  FolderWorkspaceServiceDeleteResponseSchema,
  FolderWorkspaceServiceGetPathStatusRequestSchema,
  FolderWorkspaceServiceListRequestSchema,
  FolderWorkspaceServiceListResponseSchema,
  FolderWorkspaceServiceNullableResultResponseSchema,
  FolderWorkspaceServicePathStatusResponseSchema,
  FolderWorkspaceServiceResultResponseSchema,
  FolderWorkspaceServiceUpdateFieldsSchema,
  FolderWorkspaceServiceUpdateFields_NullableLinkedReviewSchema,
  FolderWorkspaceServiceUpdateRequestSchema,
  FolderWorkspaceNullableTextSchema
} from '../generated/yiru/runtime/v1/folder_workspace_pb.js'
import {
  folderWorkspacePathStatus,
  folderWorkspaceValue,
  protocolLinkedReview,
  protocolPathScope
} from './folder-workspace-values.js'
import type {
  FolderWorkspaceCreateInput,
  FolderWorkspacePathStatusRequestInput,
  FolderWorkspaceSelectorInput,
  FolderWorkspaceUpdateInput,
  FolderWorkspaceValue
} from './folder-workspace-values.js'
import { revision } from './project-group-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const LIST_PROCEDURE = `/${FolderWorkspaceService.typeName}/${FolderWorkspaceService.method.list.name}`
const CREATE_PROCEDURE = `/${FolderWorkspaceService.typeName}/${FolderWorkspaceService.method.create.name}`
const UPDATE_PROCEDURE = `/${FolderWorkspaceService.typeName}/${FolderWorkspaceService.method.update.name}`
const DELETE_PROCEDURE = `/${FolderWorkspaceService.typeName}/${FolderWorkspaceService.method.delete.name}`
const GET_PATH_STATUS_PROCEDURE = `/${FolderWorkspaceService.typeName}/${FolderWorkspaceService.method.getPathStatus.name}`

export type FolderWorkspaceListResult = {
  folderWorkspaces: FolderWorkspaceValue[]
  revision: number
}
export type FolderWorkspaceCreateResult = {
  folderWorkspace: FolderWorkspaceValue
  revision: number
}
export type FolderWorkspaceUpdateResult = {
  folderWorkspace?: FolderWorkspaceValue
  revision: number
}
export type FolderWorkspaceDeleteResult = { deleted: boolean; revision: number }

export class FolderWorkspaceClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(options?: RuntimeCallOptions): Promise<FolderWorkspaceListResult> {
    const response = fromBinary(
      FolderWorkspaceServiceListResponseSchema,
      await this.transport.unary({
        method: LIST_PROCEDURE,
        payload: toBinary(
          FolderWorkspaceServiceListRequestSchema,
          create(FolderWorkspaceServiceListRequestSchema)
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      folderWorkspaces: response.folderWorkspaces.map(folderWorkspaceValue),
      revision: revision(response.revision)
    }
  }

  async create(
    input: FolderWorkspaceCreateInput,
    options?: RuntimeCallOptions
  ): Promise<FolderWorkspaceCreateResult> {
    const name = optionalText(input.name)
    const folderPath = optionalText(input.folderPath)
    const connectionId = optionalText(input.connectionId)
    const response = fromBinary(
      FolderWorkspaceServiceResultResponseSchema,
      await this.transport.unary({
        method: CREATE_PROCEDURE,
        payload: toBinary(
          FolderWorkspaceServiceCreateRequestSchema,
          create(FolderWorkspaceServiceCreateRequestSchema, {
            expectedRevision: BigInt(input.expectedRevision),
            projectGroupId: input.projectGroupId,
            ...(name === undefined ? {} : { name }),
            ...(folderPath === undefined ? {} : { folderPath }),
            ...(connectionId === undefined ? {} : { connectionId }),
            ...(input.linkedReview
              ? { linkedReview: protocolLinkedReview(input.linkedReview) }
              : {}),
            ...(input.createdWithAgent === undefined
              ? {}
              : { createdWithAgent: input.createdWithAgent }),
            ...(input.pendingFirstAgentMessageRename === undefined
              ? {}
              : { pendingFirstAgentMessageRename: input.pendingFirstAgentMessageRename })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.folderWorkspace) {
      throw new TypeError('Folder workspace create response is missing the folder workspace')
    }
    return {
      folderWorkspace: folderWorkspaceValue(response.folderWorkspace),
      revision: revision(response.revision)
    }
  }

  async update(
    input: FolderWorkspaceUpdateInput,
    options?: RuntimeCallOptions
  ): Promise<FolderWorkspaceUpdateResult> {
    const response = fromBinary(
      FolderWorkspaceServiceNullableResultResponseSchema,
      await this.transport.unary({
        method: UPDATE_PROCEDURE,
        payload: toBinary(
          FolderWorkspaceServiceUpdateRequestSchema,
          create(FolderWorkspaceServiceUpdateRequestSchema, {
            expectedRevision: BigInt(input.expectedRevision),
            folderWorkspaceId: input.folderWorkspaceId,
            updates: updateFields(input.updates)
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      ...(response.folderWorkspace
        ? { folderWorkspace: folderWorkspaceValue(response.folderWorkspace) }
        : {}),
      revision: revision(response.revision)
    }
  }

  async delete(
    input: FolderWorkspaceSelectorInput,
    options?: RuntimeCallOptions
  ): Promise<FolderWorkspaceDeleteResult> {
    const response = fromBinary(
      FolderWorkspaceServiceDeleteResponseSchema,
      await this.transport.unary({
        method: DELETE_PROCEDURE,
        payload: toBinary(
          FolderWorkspaceServiceDeleteRequestSchema,
          create(FolderWorkspaceServiceDeleteRequestSchema, {
            expectedRevision: BigInt(input.expectedRevision),
            folderWorkspaceId: input.folderWorkspaceId
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { deleted: response.deleted, revision: revision(response.revision) }
  }

  async getPathStatus(
    request: FolderWorkspacePathStatusRequestInput,
    options?: RuntimeCallOptions
  ): Promise<{ status: ReturnType<typeof folderWorkspacePathStatus> }> {
    const response = fromBinary(
      FolderWorkspaceServicePathStatusResponseSchema,
      await this.transport.unary({
        method: GET_PATH_STATUS_PROCEDURE,
        payload: toBinary(
          FolderWorkspaceServiceGetPathStatusRequestSchema,
          create(FolderWorkspaceServiceGetPathStatusRequestSchema, protocolPathScope(request))
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.status) {
      throw new TypeError('Folder workspace path status response is missing the status')
    }
    return { status: folderWorkspacePathStatus(response.status) }
  }
}

function updateFields(updates: FolderWorkspaceUpdateInput['updates']) {
  const name = optionalText(updates.name)
  const folderPath = optionalText(updates.folderPath)
  const workspaceStatus = optionalText(updates.workspaceStatus)
  return create(FolderWorkspaceServiceUpdateFieldsSchema, {
    ...(name === undefined ? {} : { name }),
    ...(updates.comment === undefined ? {} : { comment: updates.comment }),
    ...(folderPath === undefined ? {} : { folderPath }),
    ...(workspaceStatus === undefined ? {} : { workspaceStatus }),
    ...(updates.createdWithAgent === undefined
      ? {}
      : { createdWithAgent: updates.createdWithAgent }),
    ...(updates.manualOrder === undefined ? {} : { manualOrder: updates.manualOrder }),
    ...(updates.sortOrder === undefined ? {} : { sortOrder: updates.sortOrder }),
    ...(updates.lastActivityAt === undefined ? {} : { lastActivityAt: updates.lastActivityAt }),
    ...(updates.isArchived === undefined ? {} : { isArchived: updates.isArchived }),
    ...(updates.isPinned === undefined ? {} : { isPinned: updates.isPinned }),
    ...(updates.isUnread === undefined ? {} : { isUnread: updates.isUnread }),
    ...(updates.pendingFirstAgentMessageRename === undefined
      ? {}
      : { pendingFirstAgentMessageRename: updates.pendingFirstAgentMessageRename }),
    ...(updates.linkedReview === undefined
      ? {}
      : {
          linkedReview: create(FolderWorkspaceServiceUpdateFields_NullableLinkedReviewSchema, {
            value:
              updates.linkedReview === null
                ? { case: 'null', value: true }
                : { case: 'review', value: protocolLinkedReview(updates.linkedReview) }
          })
        }),
    ...(updates.firstAgentMessageRenameError === undefined
      ? {}
      : {
          firstAgentMessageRenameError: create(FolderWorkspaceNullableTextSchema, {
            value:
              updates.firstAgentMessageRenameError === null
                ? { case: 'null', value: true }
                : { case: 'text', value: updates.firstAgentMessageRenameError }
          })
        })
  })
}

// Why: the legacy admission rejected empty optional strings, so an empty value
// stays unset here instead of reaching the authority.
function optionalText(value: string | null | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined
}

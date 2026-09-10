import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ShellRepoHostService,
  ShellRepoHostServiceCloneAbortRequestSchema,
  ShellRepoHostServiceCloneAbortedResponseSchema,
  ShellRepoHostServiceDefaultCreateProjectParentResponseSchema,
  ShellRepoHostServiceGetDefaultCreateProjectParentRequestSchema,
  ShellRepoHostServicePickRequestSchema,
  ShellRepoHostServicePickedListResponseSchema,
  ShellRepoHostServicePickedResponseSchema,
  ShellRepoHostServiceRemoveForHostRequestSchema,
  ShellRepoHostServiceRemovedForHostResponseSchema,
  ShellRepoHostServiceReorderForHostRequestSchema,
  ShellRepoHostServiceReorderedForHostResponseSchema
} from '../generated/agent_start/runtime/v1/shell_repo_host_pb.js'
import {
  shellRepoHostPickedPath,
  shellRepoHostRemoved,
  shellRepoHostReordered,
  shellRepoHostRevision,
  type ShellRepoHostRemoveForHostInput,
  type ShellRepoHostRemoveForHostResult,
  type ShellRepoHostReorderForHostInput,
  type ShellRepoHostReorderForHostResult
} from './shell-repo-host-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const CLONE_ABORT_PROCEDURE = `/${ShellRepoHostService.typeName}/${ShellRepoHostService.method.cloneAbort.name}`
const GET_DEFAULT_CREATE_PROJECT_PARENT_PROCEDURE = `/${ShellRepoHostService.typeName}/${ShellRepoHostService.method.getDefaultCreateProjectParent.name}`
const PICK_DIRECTORY_PROCEDURE = `/${ShellRepoHostService.typeName}/${ShellRepoHostService.method.pickDirectory.name}`
const PICK_FOLDER_PROCEDURE = `/${ShellRepoHostService.typeName}/${ShellRepoHostService.method.pickFolder.name}`
const PICK_FOLDERS_PROCEDURE = `/${ShellRepoHostService.typeName}/${ShellRepoHostService.method.pickFolders.name}`
const REMOVE_FOR_HOST_PROCEDURE = `/${ShellRepoHostService.typeName}/${ShellRepoHostService.method.removeForHost.name}`
const REORDER_FOR_HOST_PROCEDURE = `/${ShellRepoHostService.typeName}/${ShellRepoHostService.method.reorderForHost.name}`

export class ShellRepoHostClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async cloneAbort(options?: RuntimeCallOptions): Promise<void> {
    const payload = await this.transport.unary({
      method: CLONE_ABORT_PROCEDURE,
      payload: toBinary(
        ShellRepoHostServiceCloneAbortRequestSchema,
        create(ShellRepoHostServiceCloneAbortRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    fromBinary(ShellRepoHostServiceCloneAbortedResponseSchema, payload)
  }

  async getDefaultCreateProjectParent(options?: RuntimeCallOptions): Promise<string> {
    const response = await this.transport.unary({
      method: GET_DEFAULT_CREATE_PROJECT_PARENT_PROCEDURE,
      payload: toBinary(
        ShellRepoHostServiceGetDefaultCreateProjectParentRequestSchema,
        create(ShellRepoHostServiceGetDefaultCreateProjectParentRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(ShellRepoHostServiceDefaultCreateProjectParentResponseSchema, response).path
  }

  async pickDirectory(options?: RuntimeCallOptions): Promise<string | null> {
    return this.pick(PICK_DIRECTORY_PROCEDURE, options)
  }

  async pickFolder(options?: RuntimeCallOptions): Promise<string | null> {
    return this.pick(PICK_FOLDER_PROCEDURE, options)
  }

  async pickFolders(options?: RuntimeCallOptions): Promise<string[]> {
    const response = await this.transport.unary({
      method: PICK_FOLDERS_PROCEDURE,
      payload: toBinary(
        ShellRepoHostServicePickRequestSchema,
        create(ShellRepoHostServicePickRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(ShellRepoHostServicePickedListResponseSchema, response).paths
  }

  async removeForHost(
    input: ShellRepoHostRemoveForHostInput,
    options?: RuntimeCallOptions
  ): Promise<ShellRepoHostRemoveForHostResult> {
    const response = await this.transport.unary({
      method: REMOVE_FOR_HOST_PROCEDURE,
      payload: toBinary(
        ShellRepoHostServiceRemoveForHostRequestSchema,
        create(ShellRepoHostServiceRemoveForHostRequestSchema, {
          expectedRevision: shellRepoHostRevision(input.expectedRevision),
          hostId: input.hostId,
          repoId: input.repoId
        })
      ),
      ...(options ? { options } : {})
    })
    return shellRepoHostRemoved(
      fromBinary(ShellRepoHostServiceRemovedForHostResponseSchema, response)
    )
  }

  async reorderForHost(
    input: ShellRepoHostReorderForHostInput,
    options?: RuntimeCallOptions
  ): Promise<ShellRepoHostReorderForHostResult> {
    const response = await this.transport.unary({
      method: REORDER_FOR_HOST_PROCEDURE,
      payload: toBinary(
        ShellRepoHostServiceReorderForHostRequestSchema,
        create(ShellRepoHostServiceReorderForHostRequestSchema, {
          expectedRevision: shellRepoHostRevision(input.expectedRevision),
          hostId: input.hostId,
          orderedIds: input.orderedIds
        })
      ),
      ...(options ? { options } : {})
    })
    return shellRepoHostReordered(
      fromBinary(ShellRepoHostServiceReorderedForHostResponseSchema, response)
    )
  }

  private async pick(procedure: string, options?: RuntimeCallOptions): Promise<string | null> {
    const response = await this.transport.unary({
      method: procedure,
      payload: toBinary(
        ShellRepoHostServicePickRequestSchema,
        create(ShellRepoHostServicePickRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return shellRepoHostPickedPath(fromBinary(ShellRepoHostServicePickedResponseSchema, response))
  }
}

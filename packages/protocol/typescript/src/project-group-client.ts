import { fromBinary, toBinary, create } from '@bufbuild/protobuf'

import {
  ProjectGroupService,
  ProjectGroupServiceCreateRequestSchema,
  ProjectGroupServiceDeleteRequestSchema,
  ProjectGroupServiceDeleteResponseSchema,
  ProjectGroupServiceEventSchema,
  ProjectGroupServiceGroupResponseSchema,
  ProjectGroupServiceListRequestSchema,
  ProjectGroupServiceListResponseSchema,
  ProjectGroupServiceMoveProjectRequestSchema,
  ProjectGroupServiceMoveProjectResponseSchema,
  ProjectGroupServiceNullableGroupResponseSchema,
  ProjectGroupServiceSubscribeEventsRequestSchema,
  ProjectGroupServiceUpdateFieldsSchema,
  ProjectGroupServiceUpdateFields_NullableColorSchema,
  ProjectGroupServiceUpdateRequestSchema
} from '../generated/yiru/runtime/v1/project_group_pb.js'
import { ProjectGroupImportClient, expectedRevision } from './project-group-import-client.js'
import { nestedScanResult } from './project-group-scan-values.js'
import {
  moveProjectRepo,
  projectGroupValue,
  protocolCreatedFrom,
  revision,
  type ProjectGroupCreateInput,
  type ProjectGroupEventValue,
  type ProjectGroupMoveProjectInput,
  type ProjectGroupRepoValue,
  type ProjectGroupSelectorInput,
  type ProjectGroupUpdateInput,
  type ProjectGroupValue
} from './project-group-values.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

const LIST_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.list.name}`
const CREATE_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.create.name}`
const UPDATE_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.update.name}`
const DELETE_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.delete.name}`
const MOVE_PROJECT_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.moveProject.name}`
const SUBSCRIBE_EVENTS_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.subscribeEvents.name}`

export type ProjectGroupListResult = { groups: ProjectGroupValue[]; revision: number }
export type ProjectGroupCreateResult = { group: ProjectGroupValue; revision: number }
export type ProjectGroupUpdateResult = { group?: ProjectGroupValue; revision: number }
export type ProjectGroupDeleteResult = { deleted: boolean; revision: number }
export type ProjectGroupMoveProjectResult = { repo?: ProjectGroupRepoValue; revision: number }
export type { ProjectGroupCancelNestedScanResult } from './project-group-import-client.js'

export type ProjectGroupEvents = Readonly<{
  events: AsyncIterable<ProjectGroupEventValue>
  cancel: (reason?: string) => Promise<void>
}>

export class ProjectGroupClient extends ProjectGroupImportClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }

  async list(options?: RuntimeCallOptions): Promise<ProjectGroupListResult> {
    const response = fromBinary(
      ProjectGroupServiceListResponseSchema,
      await this.transport.unary({
        method: LIST_PROCEDURE,
        payload: toBinary(
          ProjectGroupServiceListRequestSchema,
          create(ProjectGroupServiceListRequestSchema)
        ),
        ...(options ? { options } : {})
      })
    )
    return { groups: response.groups.map(projectGroupValue), revision: revision(response.revision) }
  }

  async create(
    input: ProjectGroupCreateInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectGroupCreateResult> {
    const response = fromBinary(
      ProjectGroupServiceGroupResponseSchema,
      await this.transport.unary({
        method: CREATE_PROCEDURE,
        payload: toBinary(
          ProjectGroupServiceCreateRequestSchema,
          create(ProjectGroupServiceCreateRequestSchema, {
            expectedRevision: expectedRevision(input.expectedRevision),
            name: input.name,
            ...(input.parentPath === undefined ? {} : { parentPath: input.parentPath }),
            ...(input.parentGroupId === undefined ? {} : { parentGroupId: input.parentGroupId }),
            ...(input.connectionId === undefined ? {} : { connectionId: input.connectionId }),
            ...(input.createdFrom === undefined
              ? {}
              : { createdFrom: protocolCreatedFrom(input.createdFrom) })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.group) {
      throw new TypeError('Project group create response is missing the group')
    }
    return { group: projectGroupValue(response.group), revision: revision(response.revision) }
  }

  async update(
    input: ProjectGroupUpdateInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectGroupUpdateResult> {
    const response = fromBinary(
      ProjectGroupServiceNullableGroupResponseSchema,
      await this.transport.unary({
        method: UPDATE_PROCEDURE,
        payload: toBinary(
          ProjectGroupServiceUpdateRequestSchema,
          create(ProjectGroupServiceUpdateRequestSchema, {
            expectedRevision: expectedRevision(input.expectedRevision),
            groupId: input.groupId,
            updates: create(ProjectGroupServiceUpdateFieldsSchema, {
              ...(input.updates.name === undefined ? {} : { name: input.updates.name }),
              ...(input.updates.isCollapsed === undefined
                ? {}
                : { isCollapsed: input.updates.isCollapsed }),
              ...(input.updates.tabOrder === undefined ? {} : { tabOrder: input.updates.tabOrder }),
              ...(input.updates.color === undefined
                ? {}
                : {
                    color: create(ProjectGroupServiceUpdateFields_NullableColorSchema, {
                      value:
                        input.updates.color === null
                          ? { case: 'null', value: true }
                          : { case: 'text', value: input.updates.color }
                    })
                  })
            })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      ...(response.group ? { group: projectGroupValue(response.group) } : {}),
      revision: revision(response.revision)
    }
  }

  async delete(
    input: ProjectGroupSelectorInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectGroupDeleteResult> {
    const response = fromBinary(
      ProjectGroupServiceDeleteResponseSchema,
      await this.transport.unary({
        method: DELETE_PROCEDURE,
        payload: toBinary(
          ProjectGroupServiceDeleteRequestSchema,
          create(ProjectGroupServiceDeleteRequestSchema, {
            expectedRevision: expectedRevision(input.expectedRevision),
            groupId: input.groupId
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { deleted: response.deleted, revision: revision(response.revision) }
  }

  async moveProject(
    input: ProjectGroupMoveProjectInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectGroupMoveProjectResult> {
    const response = fromBinary(
      ProjectGroupServiceMoveProjectResponseSchema,
      await this.transport.unary({
        method: MOVE_PROJECT_PROCEDURE,
        payload: toBinary(
          ProjectGroupServiceMoveProjectRequestSchema,
          create(ProjectGroupServiceMoveProjectRequestSchema, {
            expectedRevision: expectedRevision(input.expectedRevision),
            repo: input.repo,
            ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
            ...(input.order === undefined ? {} : { order: input.order })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return moveProjectRepo(response)
  }

  async subscribeEvents(options?: RuntimeCallOptions): Promise<ProjectGroupEvents> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_EVENTS_PROCEDURE,
      payload: toBinary(
        ProjectGroupServiceSubscribeEventsRequestSchema,
        create(ProjectGroupServiceSubscribeEventsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }
}

async function* streamEvents(stream: RuntimeStream): AsyncIterable<ProjectGroupEventValue> {
  for await (const payload of stream.events) {
    const message = fromBinary(ProjectGroupServiceEventSchema, payload).event
    switch (message.case) {
      case 'ready':
        yield { type: 'ready', subscriptionId: message.value.subscriptionId }
        break
      case 'progress':
        if (message.value.scan) {
          yield {
            type: 'progress',
            scanId: message.value.scanId,
            scan: nestedScanResult(message.value.scan)
          }
        }
        break
      case undefined:
        break
    }
  }
}

import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  SkillsService,
  SkillsServiceManageAcknowledgeUpdateRunRequestSchema,
  SkillsServiceManageAcknowledgeUpdateRunResponseSchema,
  SkillsServiceManageCancelUpdateRunRequestSchema,
  SkillsServiceManageCancelUpdateRunResponseSchema,
  SkillsServiceManageEventsSubscribeRequestSchema,
  SkillsServiceManageEventsSubscribeResponseSchema,
  SkillsServiceManageFreshnessInventoryRequestSchema,
  SkillsServiceManageFreshnessInventoryResponseSchema,
  SkillsServiceManageGetUpdateRunRequestSchema,
  SkillsServiceManageGetUpdateRunResponseSchema,
  SkillsServiceManageListSkillFilesRequestSchema,
  SkillsServiceManageListSkillFilesResponseSchema,
  SkillsServiceManageReadSkillDirFileRequestSchema,
  SkillsServiceManageReadSkillDirFileResponseSchema,
  SkillsServiceManageStartInstallRunRequestSchema,
  SkillsServiceManageStartInstallRunResponseSchema,
  SkillsServiceManageStartRemoveRunRequestSchema,
  SkillsServiceManageStartRemoveRunResponseSchema,
  SkillsServiceManageStartUpdateRunRequestSchema,
  SkillsServiceManageStartUpdateRunResponseSchema,
  SkillManageGlobalScopeSchema,
  SkillManageProjectScopeSchema,
  SkillManageScopeSchema,
  type SkillManageScope as ProtocolScope
} from '../../generated/agent_start/runtime/v1/skills_pb.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from '../transport.js'
import {
  decodeDirectoryListing,
  decodeFileReadResult,
  type SkillDirectoryListing,
  type SkillFileReadResult
} from './file-values.js'
import {
  decodeFreshnessInventory,
  decodeStartResult,
  decodeUpdateRun,
  type SkillFreshnessInventory,
  type SkillUpdateRun,
  type SkillUpdateStartResult
} from './freshness-values.js'

export type SkillManageScope = { kind: 'global' } | { kind: 'project'; repoPath: string }

const FRESHNESS_INVENTORY_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageFreshnessInventory.name}`
const START_UPDATE_RUN_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageStartUpdateRun.name}`
const START_INSTALL_RUN_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageStartInstallRun.name}`
const START_REMOVE_RUN_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageStartRemoveRun.name}`
const LIST_SKILL_FILES_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageListSkillFiles.name}`
const READ_SKILL_DIR_FILE_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageReadSkillDirFile.name}`
const CANCEL_UPDATE_RUN_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageCancelUpdateRun.name}`
const ACKNOWLEDGE_UPDATE_RUN_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageAcknowledgeUpdateRun.name}`
const GET_UPDATE_RUN_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageGetUpdateRun.name}`
const EVENTS_SUBSCRIBE_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.manageEventsSubscribe.name}`

export type SkillManageInstallInput = Readonly<{
  source: string
  skillNames?: string[]
  scope: SkillManageScope
}>

export type SkillManageRemoveInput = Readonly<{
  names: string[]
  scope: SkillManageScope
}>

export type SkillManageEvent =
  | { type: 'ready'; subscriptionId: string }
  | { type: 'run'; run: SkillUpdateRun }
  | { type: 'end' }

export type SkillManageEvents = Readonly<{
  messages: AsyncIterable<SkillManageEvent>
  cancel: (reason?: string) => Promise<void>
}>

export class SkillsManageClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async manageFreshnessInventory(options?: RuntimeCallOptions): Promise<SkillFreshnessInventory> {
    const response = await this.transport.unary({
      method: FRESHNESS_INVENTORY_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageFreshnessInventoryRequestSchema,
        create(SkillsServiceManageFreshnessInventoryRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeFreshnessInventory(
      fromBinary(SkillsServiceManageFreshnessInventoryResponseSchema, response).inventory
    )
  }

  async manageStartUpdateRun(
    names: string[],
    options?: RuntimeCallOptions
  ): Promise<SkillUpdateStartResult> {
    const response = await this.transport.unary({
      method: START_UPDATE_RUN_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageStartUpdateRunRequestSchema,
        create(SkillsServiceManageStartUpdateRunRequestSchema, { names })
      ),
      ...(options ? { options } : {})
    })
    return decodeStartResult(fromBinary(SkillsServiceManageStartUpdateRunResponseSchema, response))
  }

  async manageStartInstallRun(
    input: SkillManageInstallInput,
    options?: RuntimeCallOptions
  ): Promise<SkillUpdateStartResult> {
    const response = await this.transport.unary({
      method: START_INSTALL_RUN_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageStartInstallRunRequestSchema,
        create(SkillsServiceManageStartInstallRunRequestSchema, {
          source: input.source,
          skillNames: input.skillNames ?? [],
          scope: manageScope(input.scope)
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeStartResult(fromBinary(SkillsServiceManageStartInstallRunResponseSchema, response))
  }

  async manageStartRemoveRun(
    input: SkillManageRemoveInput,
    options?: RuntimeCallOptions
  ): Promise<SkillUpdateStartResult> {
    const response = await this.transport.unary({
      method: START_REMOVE_RUN_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageStartRemoveRunRequestSchema,
        create(SkillsServiceManageStartRemoveRunRequestSchema, {
          names: input.names,
          scope: manageScope(input.scope)
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeStartResult(fromBinary(SkillsServiceManageStartRemoveRunResponseSchema, response))
  }

  async manageListSkillFiles(
    directoryPath: string,
    options?: RuntimeCallOptions
  ): Promise<SkillDirectoryListing> {
    const response = await this.transport.unary({
      method: LIST_SKILL_FILES_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageListSkillFilesRequestSchema,
        create(SkillsServiceManageListSkillFilesRequestSchema, { directoryPath })
      ),
      ...(options ? { options } : {})
    })
    return decodeDirectoryListing(
      fromBinary(SkillsServiceManageListSkillFilesResponseSchema, response).listing
    )
  }

  async manageReadSkillDirFile(
    directoryPath: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<SkillFileReadResult> {
    const response = await this.transport.unary({
      method: READ_SKILL_DIR_FILE_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageReadSkillDirFileRequestSchema,
        create(SkillsServiceManageReadSkillDirFileRequestSchema, { directoryPath, relativePath })
      ),
      ...(options ? { options } : {})
    })
    return decodeFileReadResult(
      fromBinary(SkillsServiceManageReadSkillDirFileResponseSchema, response).result
    )
  }

  async manageCancelUpdateRun(options?: RuntimeCallOptions): Promise<SkillUpdateRun> {
    const response = await this.transport.unary({
      method: CANCEL_UPDATE_RUN_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageCancelUpdateRunRequestSchema,
        create(SkillsServiceManageCancelUpdateRunRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeUpdateRun(
      fromBinary(SkillsServiceManageCancelUpdateRunResponseSchema, response).run
    )
  }

  async manageAcknowledgeUpdateRun(options?: RuntimeCallOptions): Promise<SkillUpdateRun> {
    const response = await this.transport.unary({
      method: ACKNOWLEDGE_UPDATE_RUN_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageAcknowledgeUpdateRunRequestSchema,
        create(SkillsServiceManageAcknowledgeUpdateRunRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeUpdateRun(
      fromBinary(SkillsServiceManageAcknowledgeUpdateRunResponseSchema, response).run
    )
  }

  async manageGetUpdateRun(options?: RuntimeCallOptions): Promise<SkillUpdateRun> {
    const response = await this.transport.unary({
      method: GET_UPDATE_RUN_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageGetUpdateRunRequestSchema,
        create(SkillsServiceManageGetUpdateRunRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeUpdateRun(fromBinary(SkillsServiceManageGetUpdateRunResponseSchema, response).run)
  }

  /**
   * Push the shared skill run's state changes. The stream ends only when the
   * daemon closes it; there is no replay, so reopen after a transport swap.
   */
  async manageEventsSubscribe(options?: RuntimeCallOptions): Promise<SkillManageEvents> {
    const stream = await this.transport.subscribe({
      method: EVENTS_SUBSCRIBE_PROCEDURE,
      payload: toBinary(
        SkillsServiceManageEventsSubscribeRequestSchema,
        create(SkillsServiceManageEventsSubscribeRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { messages: manageEvents(stream), cancel: stream.cancel }
  }
}

function manageScope(scope: SkillManageScope): ProtocolScope {
  if (scope.kind === 'global') {
    return create(SkillManageScopeSchema, {
      scope: { case: 'global', value: create(SkillManageGlobalScopeSchema) }
    })
  }
  return create(SkillManageScopeSchema, {
    scope: {
      case: 'project',
      value: create(SkillManageProjectScopeSchema, { repoPath: scope.repoPath })
    }
  })
}

async function* manageEvents(stream: RuntimeStream): AsyncIterable<SkillManageEvent> {
  for await (const payload of stream.events) {
    const message = fromBinary(SkillsServiceManageEventsSubscribeResponseSchema, payload).event
    if (!message) {
      continue
    }
    switch (message.case) {
      case 'ready':
        yield { type: 'ready', subscriptionId: message.value.subscriptionId }
        break
      case 'run':
        yield { type: 'run', run: decodeUpdateRun(message.value) }
        break
      case 'end':
        yield { type: 'end' }
        break
    }
  }
}

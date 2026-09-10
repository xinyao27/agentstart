import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  UpdaterService,
  UpdaterServiceCheckRequestSchema,
  UpdaterServiceCheckResponseSchema,
  UpdaterServiceDownloadRequestSchema,
  UpdaterServiceDownloadResponseSchema,
  UpdaterServiceGetStatusRequestSchema,
  UpdaterServiceGetStatusResponseSchema,
  UpdaterServiceGetVersionRequestSchema,
  UpdaterServiceGetVersionResponseSchema,
  UpdaterServiceInstallRequestSchema,
  UpdaterServiceInstallResponseSchema,
  UpdaterServiceSubscribeStatusRequestSchema,
  UpdaterServiceSubscribeStatusResponseSchema
} from '../generated/agent_start/runtime/v1/updater_pb.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'
import {
  invalidUpdaterResponse,
  requiredUpdaterText,
  updaterSnapshot,
  type UpdaterCheckOptions,
  type UpdaterInstallResult,
  type UpdaterSnapshot,
  type UpdaterStatusSubscription
} from './updater-values.js'

const GET_VERSION_PROCEDURE = `/${UpdaterService.typeName}/${UpdaterService.method.getVersion.name}`
const GET_STATUS_PROCEDURE = `/${UpdaterService.typeName}/${UpdaterService.method.getStatus.name}`
const CHECK_PROCEDURE = `/${UpdaterService.typeName}/${UpdaterService.method.check.name}`
const DOWNLOAD_PROCEDURE = `/${UpdaterService.typeName}/${UpdaterService.method.download.name}`
const INSTALL_PROCEDURE = `/${UpdaterService.typeName}/${UpdaterService.method.install.name}`
const SUBSCRIBE_STATUS_PROCEDURE = `/${UpdaterService.typeName}/${UpdaterService.method.subscribeStatus.name}`

export class UpdaterClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getVersion(options?: RuntimeCallOptions): Promise<string> {
    const response = await this.transport.unary({
      method: GET_VERSION_PROCEDURE,
      payload: toBinary(
        UpdaterServiceGetVersionRequestSchema,
        create(UpdaterServiceGetVersionRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return requiredUpdaterText(
      fromBinary(UpdaterServiceGetVersionResponseSchema, response).version,
      'Updater version is missing'
    )
  }

  async getStatus(options?: RuntimeCallOptions): Promise<UpdaterSnapshot> {
    const response = await this.transport.unary({
      method: GET_STATUS_PROCEDURE,
      payload: toBinary(
        UpdaterServiceGetStatusRequestSchema,
        create(UpdaterServiceGetStatusRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return updaterSnapshot(fromBinary(UpdaterServiceGetStatusResponseSchema, response).snapshot)
  }

  async check(
    input: UpdaterCheckOptions = {},
    options?: RuntimeCallOptions
  ): Promise<UpdaterSnapshot> {
    const response = await this.transport.unary({
      method: CHECK_PROCEDURE,
      payload: toBinary(
        UpdaterServiceCheckRequestSchema,
        create(UpdaterServiceCheckRequestSchema, {
          includePrerelease: input.includePrerelease ?? false,
          includePerfPrerelease: input.includePerfPrerelease ?? false
        })
      ),
      ...(options ? { options } : {})
    })
    return updaterSnapshot(fromBinary(UpdaterServiceCheckResponseSchema, response).snapshot)
  }

  async download(options?: RuntimeCallOptions): Promise<UpdaterSnapshot> {
    const response = await this.transport.unary({
      method: DOWNLOAD_PROCEDURE,
      payload: toBinary(
        UpdaterServiceDownloadRequestSchema,
        create(UpdaterServiceDownloadRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return updaterSnapshot(fromBinary(UpdaterServiceDownloadResponseSchema, response).snapshot)
  }

  async install(options?: RuntimeCallOptions): Promise<UpdaterInstallResult> {
    const response = fromBinary(
      UpdaterServiceInstallResponseSchema,
      await this.transport.unary({
        method: INSTALL_PROCEDURE,
        payload: toBinary(
          UpdaterServiceInstallRequestSchema,
          create(UpdaterServiceInstallRequestSchema)
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.accepted) {
      throw invalidUpdaterResponse('Updater install was not accepted')
    }
    return {
      accepted: true,
      fromVersion: requiredUpdaterText(response.fromVersion, 'Updater source version is missing'),
      targetVersion: requiredUpdaterText(
        response.targetVersion,
        'Updater target version is missing'
      ),
      runtimeId: requiredUpdaterText(response.runtimeId, 'Updater runtime identity is missing')
    }
  }

  async subscribeStatus(options?: RuntimeCallOptions): Promise<UpdaterStatusSubscription> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_STATUS_PROCEDURE,
      payload: toBinary(
        UpdaterServiceSubscribeStatusRequestSchema,
        create(UpdaterServiceSubscribeStatusRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return {
      snapshots: protocolSnapshots(stream),
      cancel: stream.cancel
    }
  }
}

async function* protocolSnapshots(stream: RuntimeStream): AsyncIterable<UpdaterSnapshot> {
  let isReady = false
  for await (const payload of stream.events) {
    const response = fromBinary(UpdaterServiceSubscribeStatusResponseSchema, payload)
    switch (response.event.case) {
      case 'ready':
        if (isReady) {
          throw invalidUpdaterResponse('Updater subscription sent more than one ready snapshot')
        }
        isReady = true
        yield updaterSnapshot(response.event.value.snapshot)
        break
      case 'snapshot':
        if (!isReady) {
          throw invalidUpdaterResponse('Updater subscription sent a snapshot before ready')
        }
        yield updaterSnapshot(response.event.value)
        break
      case undefined:
        break
    }
  }
  if (!isReady) {
    throw invalidUpdaterResponse('Updater subscription closed before its ready snapshot')
  }
}

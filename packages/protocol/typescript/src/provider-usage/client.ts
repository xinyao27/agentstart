import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ProviderUsageService,
  ProviderUsageGetScanStateRequestSchema,
  ProviderUsageGetScanStateResponseSchema,
  ProviderUsageSetEnabledRequestSchema,
  ProviderUsageSetEnabledResponseSchema,
  ProviderUsageRefreshRequestSchema,
  ProviderUsageRefreshResponseSchema,
  ProviderUsageGetSnapshotRequestSchema,
  ProviderUsageGetSnapshotResponseSchema
} from '../../generated/yiru/runtime/v1/provider_usage_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import {
  scanStateFromProtobuf,
  snapshotFromProtobuf,
  toProtocolProvider,
  toProtocolRange,
  toProtocolScope,
  type ProviderUsageProvider,
  type ProviderUsageScanStateValue,
  type ProviderUsageSnapshot
} from './values.js'

const GET_SCAN_STATE_PROCEDURE = `/${ProviderUsageService.typeName}/${ProviderUsageService.method.getScanState.name}`
const SET_ENABLED_PROCEDURE = `/${ProviderUsageService.typeName}/${ProviderUsageService.method.setEnabled.name}`
const REFRESH_PROCEDURE = `/${ProviderUsageService.typeName}/${ProviderUsageService.method.refresh.name}`
const GET_SNAPSHOT_PROCEDURE = `/${ProviderUsageService.typeName}/${ProviderUsageService.method.getSnapshot.name}`

export class ProviderUsageClient {
  private readonly transport: RuntimeTransport
  private readonly provider: ProviderUsageProvider

  constructor(transport: RuntimeTransport, provider: ProviderUsageProvider) {
    this.transport = transport
    this.provider = provider
  }

  async getScanState(options?: RuntimeCallOptions): Promise<ProviderUsageScanStateValue> {
    const response = await this.transport.unary({
      method: GET_SCAN_STATE_PROCEDURE,
      payload: toBinary(
        ProviderUsageGetScanStateRequestSchema,
        create(ProviderUsageGetScanStateRequestSchema, {
          provider: toProtocolProvider(this.provider)
        })
      ),
      ...(options ? { options } : {})
    })
    return scanStateFromProtobuf(
      fromBinary(ProviderUsageGetScanStateResponseSchema, response).scanState
    )
  }

  async setEnabled(
    input: { enabled: boolean },
    options?: RuntimeCallOptions
  ): Promise<ProviderUsageScanStateValue> {
    const response = await this.transport.unary({
      method: SET_ENABLED_PROCEDURE,
      payload: toBinary(
        ProviderUsageSetEnabledRequestSchema,
        create(ProviderUsageSetEnabledRequestSchema, {
          provider: toProtocolProvider(this.provider),
          enabled: input.enabled
        })
      ),
      ...(options ? { options } : {})
    })
    return scanStateFromProtobuf(
      fromBinary(ProviderUsageSetEnabledResponseSchema, response).scanState
    )
  }

  async refresh(
    input: { force?: boolean } = {},
    options?: RuntimeCallOptions
  ): Promise<ProviderUsageScanStateValue> {
    const response = await this.transport.unary({
      method: REFRESH_PROCEDURE,
      payload: toBinary(
        ProviderUsageRefreshRequestSchema,
        create(ProviderUsageRefreshRequestSchema, {
          provider: toProtocolProvider(this.provider),
          force: input.force ?? false
        })
      ),
      ...(options ? { options } : {})
    })
    return scanStateFromProtobuf(fromBinary(ProviderUsageRefreshResponseSchema, response).scanState)
  }

  async getSnapshot(
    input: { scope: string; range: string; limit?: number },
    options?: RuntimeCallOptions
  ): Promise<ProviderUsageSnapshot> {
    const response = await this.transport.unary({
      method: GET_SNAPSHOT_PROCEDURE,
      payload: toBinary(
        ProviderUsageGetSnapshotRequestSchema,
        create(ProviderUsageGetSnapshotRequestSchema, {
          provider: toProtocolProvider(this.provider),
          scope: toProtocolScope(input.scope),
          range: toProtocolRange(input.range),
          limit: input.limit ? BigInt(input.limit) : undefined
        })
      ),
      ...(options ? { options } : {})
    })
    return snapshotFromProtobuf(fromBinary(ProviderUsageGetSnapshotResponseSchema, response))
  }
}

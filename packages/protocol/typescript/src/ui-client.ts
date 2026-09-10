import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  UiService,
  UiServiceGetRequestSchema,
  UiServiceGetResponseSchema,
  UiServiceRecordFeatureInteractionRequestSchema,
  UiServiceSetRequestSchema,
  UiServiceSetResponseSchema
} from '../generated/agent_start/runtime/v1/ui_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'
import { decodeUiDocument, encodeUiEntries, type UiDocumentValue } from './ui-values.js'

const GET_PROCEDURE = `/${UiService.typeName}/${UiService.method.get.name}`
const SET_PROCEDURE = `/${UiService.typeName}/${UiService.method.set.name}`
const RECORD_FEATURE_INTERACTION_PROCEDURE = `/${UiService.typeName}/${UiService.method.recordFeatureInteraction.name}`

export class UiClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async get(options?: RuntimeCallOptions): Promise<UiDocumentValue> {
    const response = await this.transport.unary({
      method: GET_PROCEDURE,
      payload: toBinary(UiServiceGetRequestSchema, create(UiServiceGetRequestSchema)),
      ...(options ? { options } : {})
    })
    return decodeUiDocument(fromBinary(UiServiceGetResponseSchema, response).ui)
  }

  async set(
    fields: Record<string, unknown>,
    options?: RuntimeCallOptions
  ): Promise<UiDocumentValue> {
    const response = await this.transport.unary({
      method: SET_PROCEDURE,
      payload: toBinary(
        UiServiceSetRequestSchema,
        create(UiServiceSetRequestSchema, { fields: encodeUiEntries(fields) })
      ),
      ...(options ? { options } : {})
    })
    return decodeUiDocument(fromBinary(UiServiceSetResponseSchema, response).ui)
  }

  async recordFeatureInteraction(
    featureId: string,
    options?: RuntimeCallOptions
  ): Promise<UiDocumentValue> {
    const response = await this.transport.unary({
      method: RECORD_FEATURE_INTERACTION_PROCEDURE,
      payload: toBinary(
        UiServiceRecordFeatureInteractionRequestSchema,
        create(UiServiceRecordFeatureInteractionRequestSchema, { featureId })
      ),
      ...(options ? { options } : {})
    })
    return decodeUiDocument(fromBinary(UiServiceSetResponseSchema, response).ui)
  }
}

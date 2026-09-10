import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ShellTelemetryConsentState as ProtocolConsentState,
  ShellTelemetryJsonNull,
  ShellTelemetryJsonValueEntrySchema,
  ShellTelemetryJsonValueListSchema,
  ShellTelemetryJsonValueObjectSchema,
  ShellTelemetryJsonValueSchema,
  ShellTelemetryService,
  ShellTelemetryServiceAcknowledgeBannerRequestSchema,
  ShellTelemetryServiceConsentStateResponseSchema,
  ShellTelemetryServiceGetConsentStateRequestSchema,
  ShellTelemetryServiceMutatedResponseSchema,
  ShellTelemetryServiceSetOptInRequestSchema,
  ShellTelemetryServiceTrackRequestSchema,
  type ShellTelemetryJsonValue as ProtocolJsonValue
} from '../generated/agent_start/runtime/v1/shell_telemetry_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export const SHELL_TELEMETRY_PROTOCOL_CAPABILITY = 'shell.telemetry.protobuf.v1' as const

export type ShellTelemetryConsentState =
  | { effective: 'enabled' }
  | {
      effective: 'disabled'
      reason: 'do_not_track' | 'agentstart_disabled' | 'ci' | 'user_opt_out'
    }
  | { effective: 'pending_banner' }

const TRACK_PROCEDURE = `/${ShellTelemetryService.typeName}/${ShellTelemetryService.method.track.name}`
const GET_CONSENT_STATE_PROCEDURE = `/${ShellTelemetryService.typeName}/${ShellTelemetryService.method.getConsentState.name}`
const SET_OPT_IN_PROCEDURE = `/${ShellTelemetryService.typeName}/${ShellTelemetryService.method.setOptIn.name}`
const ACKNOWLEDGE_BANNER_PROCEDURE = `/${ShellTelemetryService.typeName}/${ShellTelemetryService.method.acknowledgeBanner.name}`

export class ShellTelemetryClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async track(
    name: string,
    props: Record<string, unknown>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: TRACK_PROCEDURE,
      payload: toBinary(
        ShellTelemetryServiceTrackRequestSchema,
        create(ShellTelemetryServiceTrackRequestSchema, {
          name,
          props: Object.entries(props)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) =>
              create(ShellTelemetryJsonValueEntrySchema, { key, value: jsonToValue(value) })
            )
        })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(ShellTelemetryServiceMutatedResponseSchema, response)
  }

  async getConsentState(options?: RuntimeCallOptions): Promise<ShellTelemetryConsentState> {
    const response = await this.transport.unary({
      method: GET_CONSENT_STATE_PROCEDURE,
      payload: toBinary(
        ShellTelemetryServiceGetConsentStateRequestSchema,
        create(ShellTelemetryServiceGetConsentStateRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return consentState(fromBinary(ShellTelemetryServiceConsentStateResponseSchema, response).state)
  }

  async setOptIn(optedIn: boolean, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: SET_OPT_IN_PROCEDURE,
      payload: toBinary(
        ShellTelemetryServiceSetOptInRequestSchema,
        create(ShellTelemetryServiceSetOptInRequestSchema, { optedIn })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(ShellTelemetryServiceMutatedResponseSchema, response)
  }

  async acknowledgeBanner(options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: ACKNOWLEDGE_BANNER_PROCEDURE,
      payload: toBinary(
        ShellTelemetryServiceAcknowledgeBannerRequestSchema,
        create(ShellTelemetryServiceAcknowledgeBannerRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    fromBinary(ShellTelemetryServiceMutatedResponseSchema, response)
  }
}

// Why: the consent resolver answers one closed progression, so the wire's
// flattened enum expands back into the tagged union the Privacy pane matches on.
function consentState(state: ProtocolConsentState): ShellTelemetryConsentState {
  switch (state) {
    case ProtocolConsentState.ENABLED:
      return { effective: 'enabled' }
    case ProtocolConsentState.PENDING_BANNER:
      return { effective: 'pending_banner' }
    case ProtocolConsentState.DISABLED_DO_NOT_TRACK:
      return { effective: 'disabled', reason: 'do_not_track' }
    case ProtocolConsentState.DISABLED_AGENT_START_DISABLED:
      return { effective: 'disabled', reason: 'agentstart_disabled' }
    case ProtocolConsentState.DISABLED_CI:
      return { effective: 'disabled', reason: 'ci' }
    case ProtocolConsentState.DISABLED_USER_OPT_OUT:
      return { effective: 'disabled', reason: 'user_opt_out' }
    case ProtocolConsentState.UNSPECIFIED:
      throw invalidConsent('Telemetry consent state is unspecified')
  }
}

function invalidConsent(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

// Why: the event properties are validated per-event against the shipped
// schema set, so their values stay open-ended and render into the same typed
// recursive JSON value the wire models.
function jsonToValue(value: unknown): ProtocolJsonValue {
  if (value === null || value === undefined) {
    return create(ShellTelemetryJsonValueSchema, {
      kind: { case: 'nullValue', value: ShellTelemetryJsonNull.VALUE }
    })
  }
  switch (typeof value) {
    case 'boolean':
      return create(ShellTelemetryJsonValueSchema, { kind: { case: 'boolValue', value } })
    case 'number':
      return Number.isFinite(value)
        ? create(ShellTelemetryJsonValueSchema, { kind: { case: 'numberValue', value } })
        : create(ShellTelemetryJsonValueSchema, {
            kind: { case: 'nullValue', value: ShellTelemetryJsonNull.VALUE }
          })
    case 'string':
      return create(ShellTelemetryJsonValueSchema, { kind: { case: 'stringValue', value } })
    case 'object':
      return Array.isArray(value)
        ? create(ShellTelemetryJsonValueSchema, {
            kind: {
              case: 'listValue',
              value: create(ShellTelemetryJsonValueListSchema, {
                values: value.map(jsonToValue)
              })
            }
          })
        : create(ShellTelemetryJsonValueSchema, {
            kind: {
              case: 'objectValue',
              value: create(ShellTelemetryJsonValueObjectSchema, {
                entries: Object.entries(value as Record<string, unknown>)
                  .filter(([, entry]) => entry !== undefined)
                  .map(([key, entry]) =>
                    create(ShellTelemetryJsonValueEntrySchema, {
                      key,
                      value: jsonToValue(entry)
                    })
                  )
              })
            }
          })
  }
  return create(ShellTelemetryJsonValueSchema, {
    kind: { case: 'nullValue', value: ShellTelemetryJsonNull.VALUE }
  })
}

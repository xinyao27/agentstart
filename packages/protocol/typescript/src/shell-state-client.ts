import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ShellCacheGitHubCacheSchema,
  ShellCacheGitHubEntrySchema,
  ShellCacheGitHubRecordSchema,
  ShellCacheJsonNull,
  ShellCacheJsonValueSchema,
  ShellCacheJsonValueEntrySchema,
  ShellCacheJsonValueListSchema,
  ShellCacheJsonValueObjectSchema,
  ShellCacheService,
  ShellCacheServiceGetGitHubRequestSchema,
  ShellCacheServiceSetGitHubRequestSchema,
  ShellOnboardingChecklistUpdateSchema,
  ShellOnboardingNullableNumberSchema,
  ShellOnboardingNullableOutcomeSchema,
  ShellOnboardingOutcome,
  ShellOnboardingService,
  ShellOnboardingServiceGetRequestSchema,
  ShellOnboardingServiceUpdateRequestSchema,
  ShellOnboardingStateSchema,
  type ShellCacheJsonValue
} from '../generated/yiru/runtime/v1/shell_state_pb.js'
import {
  SHELL_CACHE_PROTOCOL_CAPABILITY,
  SHELL_ONBOARDING_PROTOCOL_CAPABILITY,
  shellCacheGitHubCache,
  shellOnboardingState,
  type ShellCacheGitHubCacheValue,
  type ShellCachePlainJsonValue,
  type ShellOnboardingOutcomeName,
  type ShellOnboardingStateValue
} from './shell-state-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export { SHELL_CACHE_PROTOCOL_CAPABILITY, SHELL_ONBOARDING_PROTOCOL_CAPABILITY }

const GET_GITHUB_PROCEDURE = `/${ShellCacheService.typeName}/${ShellCacheService.method.getGitHub.name}`
const SET_GITHUB_PROCEDURE = `/${ShellCacheService.typeName}/${ShellCacheService.method.setGitHub.name}`
const ONBOARDING_GET_PROCEDURE = `/${ShellOnboardingService.typeName}/${ShellOnboardingService.method.get.name}`
const ONBOARDING_UPDATE_PROCEDURE = `/${ShellOnboardingService.typeName}/${ShellOnboardingService.method.update.name}`

export type ShellOnboardingUpdateInput = Partial<{
  flowVersion: number
  closedAt: number | null
  outcome: ShellOnboardingOutcomeName | null
  lastCompletedStep: number
  checklist: Partial<ShellOnboardingStateValue['checklist']>
}>

export class ShellCacheClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getGitHub(options?: RuntimeCallOptions): Promise<ShellCacheGitHubCacheValue> {
    const response = await this.transport.unary({
      method: GET_GITHUB_PROCEDURE,
      payload: toBinary(
        ShellCacheServiceGetGitHubRequestSchema,
        create(ShellCacheServiceGetGitHubRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return shellCacheGitHubCache(fromBinary(ShellCacheGitHubCacheSchema, response))
  }

  async setGitHub(
    input: { cache: ShellCacheGitHubCacheValue },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.transport.unary({
      method: SET_GITHUB_PROCEDURE,
      payload: toBinary(
        ShellCacheServiceSetGitHubRequestSchema,
        create(ShellCacheServiceSetGitHubRequestSchema, {
          cache: create(ShellCacheGitHubCacheSchema, {
            pr: Object.entries(input.cache.pr).map(([key, entry]) =>
              create(ShellCacheGitHubEntrySchema, {
                key,
                value: create(ShellCacheGitHubRecordSchema, {
                  data: jsonValue(entry.data),
                  fetchedAt: entry.fetchedAt
                })
              })
            )
          })
        })
      ),
      ...(options ? { options } : {})
    })
  }
}

export class ShellOnboardingClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async get(options?: RuntimeCallOptions): Promise<ShellOnboardingStateValue> {
    const response = await this.transport.unary({
      method: ONBOARDING_GET_PROCEDURE,
      payload: toBinary(
        ShellOnboardingServiceGetRequestSchema,
        create(ShellOnboardingServiceGetRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return shellOnboardingState(fromBinary(ShellOnboardingStateSchema, response))
  }

  async update(
    input: ShellOnboardingUpdateInput,
    options?: RuntimeCallOptions
  ): Promise<ShellOnboardingStateValue> {
    const response = await this.transport.unary({
      method: ONBOARDING_UPDATE_PROCEDURE,
      payload: toBinary(
        ShellOnboardingServiceUpdateRequestSchema,
        create(ShellOnboardingServiceUpdateRequestSchema, {
          ...(input.flowVersion === undefined ? {} : { flowVersion: BigInt(input.flowVersion) }),
          ...(input.closedAt === undefined
            ? {}
            : {
                closedAt: create(ShellOnboardingNullableNumberSchema, {
                  value:
                    input.closedAt === null
                      ? { case: 'null' as const, value: true }
                      : { case: 'number' as const, value: input.closedAt }
                })
              }),
          ...(input.outcome === undefined
            ? {}
            : {
                outcome: create(ShellOnboardingNullableOutcomeSchema, {
                  value:
                    input.outcome === null
                      ? { case: 'null' as const, value: true }
                      : {
                          case: 'outcome' as const,
                          value:
                            input.outcome === 'completed'
                              ? ShellOnboardingOutcome.COMPLETED
                              : ShellOnboardingOutcome.DISMISSED
                        }
                })
              }),
          ...(input.lastCompletedStep === undefined
            ? {}
            : { lastCompletedStep: BigInt(input.lastCompletedStep) }),
          ...(input.checklist === undefined
            ? {}
            : { checklist: create(ShellOnboardingChecklistUpdateSchema, input.checklist) })
        })
      ),
      ...(options ? { options } : {})
    })
    return shellOnboardingState(fromBinary(ShellOnboardingStateSchema, response))
  }
}

// Why: the PR payload inside the cache entry is the open raw GitHub API
// document, so the encoder rebuilds the typed recursive JSON value.
function jsonValue(value: ShellCachePlainJsonValue): ShellCacheJsonValue {
  if (value === null) {
    return create(ShellCacheJsonValueSchema, {
      kind: { case: 'nullValue', value: ShellCacheJsonNull.VALUE }
    })
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return create(ShellCacheJsonValueSchema, {
      kind:
        typeof value === 'boolean'
          ? { case: 'boolValue', value }
          : typeof value === 'number'
            ? { case: 'numberValue', value }
            : { case: 'stringValue', value }
    })
  }
  if (Array.isArray(value)) {
    return create(ShellCacheJsonValueSchema, {
      kind: {
        case: 'listValue',
        value: create(ShellCacheJsonValueListSchema, { values: value.map(jsonValue) })
      }
    })
  }
  return create(ShellCacheJsonValueSchema, {
    kind: {
      case: 'objectValue',
      value: create(ShellCacheJsonValueObjectSchema, {
        entries: Object.entries(value).map(([key, entry]) =>
          create(ShellCacheJsonValueEntrySchema, { key, value: jsonValue(entry) })
        )
      })
    }
  })
}

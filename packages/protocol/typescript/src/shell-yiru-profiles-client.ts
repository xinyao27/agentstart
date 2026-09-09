import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ShellYiruProfilesService,
  ShellYiruProfilesServiceCreateLocalRequestSchema,
  ShellYiruProfilesServiceCreateResponseSchema,
  ShellYiruProfilesServiceFindProjectProfilesRequestSchema,
  ShellYiruProfilesServiceFindResponseSchema,
  ShellYiruProfilesServiceListRequestSchema,
  ShellYiruProfilesServiceListResponseSchema,
  ShellYiruProfilesServiceSwitchProfileRequestSchema,
  ShellYiruProfilesServiceSwitchResponseSchema,
  ShellYiruProfilesServiceTransferProjectRequestSchema,
  ShellYiruProfilesServiceTransferResponseSchema
} from '../generated/yiru/runtime/v1/shell_yiru_profiles_pb.js'
import {
  profilesCreate,
  profilesFind,
  profilesList,
  profilesSwitch,
  profilesTransfer,
  protocolTransferMode
} from './shell-yiru-profiles-values.js'
import type {
  YiruProfilesCreateLocalValue,
  YiruProfilesListValue,
  YiruProfilesSwitchValue,
  YiruProfilesTransferValue
} from './shell-yiru-profiles-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const LIST_PROCEDURE = `/${ShellYiruProfilesService.typeName}/${ShellYiruProfilesService.method.list.name}`
const CREATE_LOCAL_PROCEDURE = `/${ShellYiruProfilesService.typeName}/${ShellYiruProfilesService.method.createLocal.name}`
const SWITCH_PROFILE_PROCEDURE = `/${ShellYiruProfilesService.typeName}/${ShellYiruProfilesService.method.switchProfile.name}`
const TRANSFER_PROJECT_PROCEDURE = `/${ShellYiruProfilesService.typeName}/${ShellYiruProfilesService.method.transferProject.name}`
const FIND_PROJECT_PROFILES_PROCEDURE = `/${ShellYiruProfilesService.typeName}/${ShellYiruProfilesService.method.findProjectProfiles.name}`

export class ShellYiruProfilesClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(options?: RuntimeCallOptions): Promise<YiruProfilesListValue> {
    const response = fromBinary(
      ShellYiruProfilesServiceListResponseSchema,
      await this.transport.unary({
        method: LIST_PROCEDURE,
        payload: toBinary(
          ShellYiruProfilesServiceListRequestSchema,
          create(ShellYiruProfilesServiceListRequestSchema)
        ),
        ...(options ? { options } : {})
      })
    )
    return profilesList(response)
  }

  async createLocal(
    input: { name?: string } | undefined,
    options?: RuntimeCallOptions
  ): Promise<YiruProfilesCreateLocalValue> {
    const response = fromBinary(
      ShellYiruProfilesServiceCreateResponseSchema,
      await this.transport.unary({
        method: CREATE_LOCAL_PROCEDURE,
        payload: toBinary(
          ShellYiruProfilesServiceCreateLocalRequestSchema,
          create(
            ShellYiruProfilesServiceCreateLocalRequestSchema,
            input?.name === undefined ? {} : { name: input.name }
          )
        ),
        ...(options ? { options } : {})
      })
    )
    return profilesCreate(response)
  }

  async switchProfile(
    input: { profileId: string },
    options?: RuntimeCallOptions
  ): Promise<YiruProfilesSwitchValue> {
    const response = fromBinary(
      ShellYiruProfilesServiceSwitchResponseSchema,
      await this.transport.unary({
        method: SWITCH_PROFILE_PROCEDURE,
        payload: toBinary(
          ShellYiruProfilesServiceSwitchProfileRequestSchema,
          create(ShellYiruProfilesServiceSwitchProfileRequestSchema, {
            profileId: input.profileId
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return profilesSwitch(response)
  }

  async transferProject(
    input: {
      sourceProfileId: string
      targetProfileId: string
      repoId: string
      mode: 'move' | 'copy'
    },
    options?: RuntimeCallOptions
  ): Promise<YiruProfilesTransferValue> {
    const response = fromBinary(
      ShellYiruProfilesServiceTransferResponseSchema,
      await this.transport.unary({
        method: TRANSFER_PROJECT_PROCEDURE,
        payload: toBinary(
          ShellYiruProfilesServiceTransferProjectRequestSchema,
          create(ShellYiruProfilesServiceTransferProjectRequestSchema, {
            sourceProfileId: input.sourceProfileId,
            targetProfileId: input.targetProfileId,
            repoId: input.repoId,
            mode: protocolTransferMode(input.mode)
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return profilesTransfer(response)
  }

  async findProjectProfiles(
    input: {
      path: string
      connectionId?: string | null
      executionHostId?: string | null
      excludeProfileId?: string | null
    },
    options?: RuntimeCallOptions
  ): Promise<{ projects: ReturnType<typeof profilesFind>['projects'] }> {
    const connectionId = optionalText(input.connectionId)
    const executionHostId = optionalText(input.executionHostId)
    const excludeProfileId = optionalText(input.excludeProfileId)
    const response = fromBinary(
      ShellYiruProfilesServiceFindResponseSchema,
      await this.transport.unary({
        method: FIND_PROJECT_PROFILES_PROCEDURE,
        payload: toBinary(
          ShellYiruProfilesServiceFindProjectProfilesRequestSchema,
          create(ShellYiruProfilesServiceFindProjectProfilesRequestSchema, {
            path: input.path,
            ...(connectionId === undefined ? {} : { connectionId }),
            ...(executionHostId === undefined ? {} : { executionHostId }),
            ...(excludeProfileId === undefined ? {} : { excludeProfileId })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return profilesFind(response)
  }
}

// Why: the daemon ignores empty optional strings exactly like the legacy
// surface's min-length validation, so an empty value stays unset here.
function optionalText(value: string | null | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined
}

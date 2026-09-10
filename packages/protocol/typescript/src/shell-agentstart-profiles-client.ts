import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ShellAgentStartProfilesService,
  ShellAgentStartProfilesServiceCreateLocalRequestSchema,
  ShellAgentStartProfilesServiceCreateResponseSchema,
  ShellAgentStartProfilesServiceFindProjectProfilesRequestSchema,
  ShellAgentStartProfilesServiceFindResponseSchema,
  ShellAgentStartProfilesServiceListRequestSchema,
  ShellAgentStartProfilesServiceListResponseSchema,
  ShellAgentStartProfilesServiceSwitchProfileRequestSchema,
  ShellAgentStartProfilesServiceSwitchResponseSchema,
  ShellAgentStartProfilesServiceTransferProjectRequestSchema,
  ShellAgentStartProfilesServiceTransferResponseSchema
} from '../generated/agent_start/runtime/v1/shell_agentstart_profiles_pb.js'
import {
  profilesCreate,
  profilesFind,
  profilesList,
  profilesSwitch,
  profilesTransfer,
  protocolTransferMode
} from './shell-agentstart-profiles-values.js'
import type {
  AgentStartProfilesCreateLocalValue,
  AgentStartProfilesListValue,
  AgentStartProfilesSwitchValue,
  AgentStartProfilesTransferValue
} from './shell-agentstart-profiles-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const LIST_PROCEDURE = `/${ShellAgentStartProfilesService.typeName}/${ShellAgentStartProfilesService.method.list.name}`
const CREATE_LOCAL_PROCEDURE = `/${ShellAgentStartProfilesService.typeName}/${ShellAgentStartProfilesService.method.createLocal.name}`
const SWITCH_PROFILE_PROCEDURE = `/${ShellAgentStartProfilesService.typeName}/${ShellAgentStartProfilesService.method.switchProfile.name}`
const TRANSFER_PROJECT_PROCEDURE = `/${ShellAgentStartProfilesService.typeName}/${ShellAgentStartProfilesService.method.transferProject.name}`
const FIND_PROJECT_PROFILES_PROCEDURE = `/${ShellAgentStartProfilesService.typeName}/${ShellAgentStartProfilesService.method.findProjectProfiles.name}`

export class ShellAgentStartProfilesClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(options?: RuntimeCallOptions): Promise<AgentStartProfilesListValue> {
    const response = fromBinary(
      ShellAgentStartProfilesServiceListResponseSchema,
      await this.transport.unary({
        method: LIST_PROCEDURE,
        payload: toBinary(
          ShellAgentStartProfilesServiceListRequestSchema,
          create(ShellAgentStartProfilesServiceListRequestSchema)
        ),
        ...(options ? { options } : {})
      })
    )
    return profilesList(response)
  }

  async createLocal(
    input: { name?: string } | undefined,
    options?: RuntimeCallOptions
  ): Promise<AgentStartProfilesCreateLocalValue> {
    const response = fromBinary(
      ShellAgentStartProfilesServiceCreateResponseSchema,
      await this.transport.unary({
        method: CREATE_LOCAL_PROCEDURE,
        payload: toBinary(
          ShellAgentStartProfilesServiceCreateLocalRequestSchema,
          create(
            ShellAgentStartProfilesServiceCreateLocalRequestSchema,
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
  ): Promise<AgentStartProfilesSwitchValue> {
    const response = fromBinary(
      ShellAgentStartProfilesServiceSwitchResponseSchema,
      await this.transport.unary({
        method: SWITCH_PROFILE_PROCEDURE,
        payload: toBinary(
          ShellAgentStartProfilesServiceSwitchProfileRequestSchema,
          create(ShellAgentStartProfilesServiceSwitchProfileRequestSchema, {
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
  ): Promise<AgentStartProfilesTransferValue> {
    const response = fromBinary(
      ShellAgentStartProfilesServiceTransferResponseSchema,
      await this.transport.unary({
        method: TRANSFER_PROJECT_PROCEDURE,
        payload: toBinary(
          ShellAgentStartProfilesServiceTransferProjectRequestSchema,
          create(ShellAgentStartProfilesServiceTransferProjectRequestSchema, {
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
      ShellAgentStartProfilesServiceFindResponseSchema,
      await this.transport.unary({
        method: FIND_PROJECT_PROFILES_PROCEDURE,
        payload: toBinary(
          ShellAgentStartProfilesServiceFindProjectProfilesRequestSchema,
          create(ShellAgentStartProfilesServiceFindProjectProfilesRequestSchema, {
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

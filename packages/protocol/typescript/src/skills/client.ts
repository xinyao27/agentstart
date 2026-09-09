import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  SkillDiscoverRuntime,
  SkillsService,
  SkillsServiceDiscoverRequestSchema,
  SkillsServiceDiscoverResponseSchema
} from '../../generated/yiru/runtime/v1/skills_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import { decodeDiscovery, type SkillDiscoveryResult } from './discovery-values.js'
import { SkillsManageClient } from './manage-client.js'

const DISCOVER_PROCEDURE = `/${SkillsService.typeName}/${SkillsService.method.discover.name}`

export const SKILLS_PROTOCOL_CAPABILITY = 'skills.protobuf.v1' as const

export type SkillDiscoverInput = Readonly<{
  runtime?: 'host' | 'wsl'
  cwd?: string
  executionHostId?: string
}>

export class SkillsClient extends SkillsManageClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }

  async discover(
    input: SkillDiscoverInput = {},
    options?: RuntimeCallOptions
  ): Promise<SkillDiscoveryResult> {
    const response = await this.transport.unary({
      method: DISCOVER_PROCEDURE,
      payload: toBinary(
        SkillsServiceDiscoverRequestSchema,
        create(SkillsServiceDiscoverRequestSchema, {
          runtime: input.runtime === 'wsl' ? SkillDiscoverRuntime.WSL : SkillDiscoverRuntime.HOST,
          ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
          ...(input.executionHostId !== undefined ? { executionHostId: input.executionHostId } : {})
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeDiscovery(fromBinary(SkillsServiceDiscoverResponseSchema, response))
  }
}

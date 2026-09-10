import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  BrowserRuntimeService,
  PageResultSchema,
  TabCreateCommandSchema
} from '../generated/agent_start/runtime/v1/browser_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const CREATE_TAB_PROCEDURE = `/${BrowserRuntimeService.typeName}/${BrowserRuntimeService.method.createTab.name}`

export class BrowserRuntimeClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async createTab(
    input: { worktree: string; url?: string; profileId?: string },
    options?: RuntimeCallOptions
  ): Promise<{ browserPageId: string }> {
    const response = await this.transport.unary({
      method: CREATE_TAB_PROCEDURE,
      payload: toBinary(
        TabCreateCommandSchema,
        create(TabCreateCommandSchema, {
          target: { worktree: input.worktree },
          url: input.url,
          profileId: input.profileId
        })
      ),
      ...(options ? { options } : {})
    })
    const result = fromBinary(PageResultSchema, response)
    if (!result.browserPageId.trim()) {
      throw new Error('Browser tab creation returned no page identity')
    }
    return { browserPageId: result.browserPageId }
  }
}

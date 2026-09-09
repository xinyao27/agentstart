import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  AiVaultService,
  AiVaultServiceListSessionsRequestSchema,
  AiVaultServiceListSessionsResponseSchema,
  AiVaultServiceListSubagentSessionsRequestSchema,
  AiVaultServiceListSubagentSessionsResponseSchema
} from '../generated/yiru/runtime/v1/ai_vault_pb.js'
import {
  aiVaultScanIssue,
  aiVaultSession,
  type AiVaultListResultRecord,
  type AiVaultSubagentListResultRecord
} from './ai-vault-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const LIST_SESSIONS_PROCEDURE = `/${AiVaultService.typeName}/${AiVaultService.method.listSessions.name}`
const LIST_SUBAGENT_SESSIONS_PROCEDURE = `/${AiVaultService.typeName}/${AiVaultService.method.listSubagentSessions.name}`

export type AiVaultListInput = Readonly<{
  compact?: boolean
  executionHostId?: string
  executionHostScope?: string
  force?: boolean
  limit?: number
  scopePaths?: readonly string[]
}>

export type AiVaultSubagentListInput = Readonly<{
  agent?: string
  executionHostId?: string
  parentFilePath?: string
}>

export class AiVaultClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async listSessions(
    input: AiVaultListInput = {},
    options?: RuntimeCallOptions
  ): Promise<AiVaultListResultRecord> {
    const response = await this.transport.unary({
      method: LIST_SESSIONS_PROCEDURE,
      payload: toBinary(
        AiVaultServiceListSessionsRequestSchema,
        create(AiVaultServiceListSessionsRequestSchema, {
          compact: input.compact ?? false,
          executionHostId: input.executionHostId,
          executionHostScope: input.executionHostScope,
          force: input.force ?? false,
          limit: input.limit,
          scopePaths: input.scopePaths ? [...input.scopePaths] : []
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(AiVaultServiceListSessionsResponseSchema, response)
    return {
      issues: decoded.issues.map(aiVaultScanIssue),
      scannedAt: decoded.scannedAt,
      sessions: decoded.sessions.map(aiVaultSession)
    }
  }

  async listSubagentSessions(
    input: AiVaultSubagentListInput = {},
    options?: RuntimeCallOptions
  ): Promise<AiVaultSubagentListResultRecord> {
    const response = await this.transport.unary({
      method: LIST_SUBAGENT_SESSIONS_PROCEDURE,
      payload: toBinary(
        AiVaultServiceListSubagentSessionsRequestSchema,
        create(AiVaultServiceListSubagentSessionsRequestSchema, {
          agent: input.agent,
          executionHostId: input.executionHostId,
          parentFilePath: input.parentFilePath
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(AiVaultServiceListSubagentSessionsResponseSchema, response)
    return {
      issues: decoded.issues.map(aiVaultScanIssue),
      sessions: decoded.sessions.map(aiVaultSession)
    }
  }
}

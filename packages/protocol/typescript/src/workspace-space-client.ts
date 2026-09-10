import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  WorkspaceSpaceService,
  WorkspaceSpaceServiceAnalyzeRequestSchema,
  WorkspaceSpaceServiceAnalyzeResponseSchema,
  WorkspaceSpaceServiceCancelRequestSchema,
  WorkspaceSpaceServiceCancelResponseSchema
} from '../generated/agent_start/runtime/v1/workspace_space_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'
import {
  workspaceSpaceAnalysis,
  type WorkspaceSpaceAnalysisValue
} from './workspace-space-values.js'

const ANALYZE_PROCEDURE = `/${WorkspaceSpaceService.typeName}/${WorkspaceSpaceService.method.analyze.name}`
const CANCEL_PROCEDURE = `/${WorkspaceSpaceService.typeName}/${WorkspaceSpaceService.method.cancel.name}`

// Why: the legacy analyze result is an untagged union — either the finished
// analysis or the cancelled marker — so the decoded result keeps that shape.
export type WorkspaceSpaceAnalyzeResultValue =
  | { ok: true; analysis: WorkspaceSpaceAnalysisValue }
  | { ok: false; cancelled: true }

export class WorkspaceSpaceClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async analyze(options?: RuntimeCallOptions): Promise<WorkspaceSpaceAnalyzeResultValue> {
    const response = await this.transport.unary({
      method: ANALYZE_PROCEDURE,
      payload: toBinary(
        WorkspaceSpaceServiceAnalyzeRequestSchema,
        create(WorkspaceSpaceServiceAnalyzeRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(WorkspaceSpaceServiceAnalyzeResponseSchema, response)
    switch (decoded.result.case) {
      case 'analysis':
        return { ok: true, analysis: workspaceSpaceAnalysis(decoded.result.value) }
      case 'cancelled':
        return { ok: false, cancelled: true }
      case undefined:
        throw new RuntimeProtocolError(
          StatusCode.DATA_LOSS,
          'Workspace space analyze returned no result'
        )
    }
  }

  async cancel(options?: RuntimeCallOptions): Promise<{ cancelled: boolean }> {
    const response = await this.transport.unary({
      method: CANCEL_PROCEDURE,
      payload: toBinary(
        WorkspaceSpaceServiceCancelRequestSchema,
        create(WorkspaceSpaceServiceCancelRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(WorkspaceSpaceServiceCancelResponseSchema, response)
  }
}

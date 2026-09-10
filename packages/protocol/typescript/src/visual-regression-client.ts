import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  VisualRegressionDiffRatioSchema,
  VisualRegressionService,
  VisualRegressionServiceCaptureResponseSchema,
  VisualRegressionServiceLatestRequestSchema,
  VisualRegressionServiceSaveRequestSchema
} from '../generated/agent_start/runtime/v1/visual_regression_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'
import {
  visualRegressionCapture,
  type VisualRegressionCaptureValue
} from './visual-regression-values.js'

const LATEST_PROCEDURE = `/${VisualRegressionService.typeName}/${VisualRegressionService.method.latest.name}`
const SAVE_PROCEDURE = `/${VisualRegressionService.typeName}/${VisualRegressionService.method.save.name}`

export type VisualRegressionLatestInput = Readonly<{
  pageUrl: string
  projectId: string
  worktreeId: string
}>

export type VisualRegressionSaveInput = VisualRegressionLatestInput &
  Readonly<{
    diffRatio: number | null
    height: number
    imageArtifactId: string
    width: number
  }>

export type VisualRegressionLatestResult = Readonly<{
  capture: VisualRegressionCaptureValue | null
}>

export type VisualRegressionSaveResult = Readonly<{
  capture: VisualRegressionCaptureValue
}>

export class VisualRegressionClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async latest(
    input: VisualRegressionLatestInput,
    options?: RuntimeCallOptions
  ): Promise<VisualRegressionLatestResult> {
    const response = await this.transport.unary({
      method: LATEST_PROCEDURE,
      payload: toBinary(
        VisualRegressionServiceLatestRequestSchema,
        create(VisualRegressionServiceLatestRequestSchema, {
          pageUrl: input.pageUrl,
          projectId: input.projectId,
          worktreeId: input.worktreeId
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(VisualRegressionServiceCaptureResponseSchema, response)
    return { capture: decoded.capture ? visualRegressionCapture(decoded.capture) : null }
  }

  async save(
    input: VisualRegressionSaveInput,
    options?: RuntimeCallOptions
  ): Promise<VisualRegressionSaveResult> {
    const response = await this.transport.unary({
      method: SAVE_PROCEDURE,
      payload: toBinary(
        VisualRegressionServiceSaveRequestSchema,
        create(VisualRegressionServiceSaveRequestSchema, {
          pageUrl: input.pageUrl,
          projectId: input.projectId,
          worktreeId: input.worktreeId,
          // Why: the legacy surface requires diffRatio to be present but
          // nullable, so the wrapper keeps "explicit null" from "field absent".
          diffRatio: create(VisualRegressionDiffRatioSchema, {
            value:
              input.diffRatio === null
                ? { case: 'null' as const, value: true }
                : { case: 'ratio' as const, value: input.diffRatio }
          }),
          height: BigInt(input.height),
          width: BigInt(input.width),
          imageArtifactId: input.imageArtifactId
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(VisualRegressionServiceCaptureResponseSchema, response)
    if (!decoded.capture) {
      throw new RuntimeProtocolError(
        StatusCode.DATA_LOSS,
        'Visual regression save returned no capture'
      )
    }
    return { capture: visualRegressionCapture(decoded.capture) }
  }
}

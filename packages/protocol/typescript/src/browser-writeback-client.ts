import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  BrowserWritebackApplyColorRequestSchema,
  BrowserWritebackApplyColorResponseSchema,
  BrowserWritebackApplyCssRequestSchema,
  BrowserWritebackApplyCssResponseSchema,
  BrowserWritebackElementEvidenceSchema,
  BrowserWritebackLocateElementRequestSchema,
  BrowserWritebackLocateElementResponseSchema,
  BrowserWritebackRecordVerificationRequestSchema,
  BrowserWritebackRecordVerificationResponseSchema,
  BrowserWritebackService,
  BrowserWritebackStyleEntrySchema
} from '../generated/yiru/runtime/v1/browser_writeback_pb.js'
import type {
  BrowserWritebackCssChange,
  BrowserWritebackElementEvidence,
  BrowserWritebackTarget
} from './browser-writeback-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const APPLY_COLOR_PROCEDURE = `/${BrowserWritebackService.typeName}/${BrowserWritebackService.method.applyColor.name}`
const APPLY_CSS_PROCEDURE = `/${BrowserWritebackService.typeName}/${BrowserWritebackService.method.applyCss.name}`
const LOCATE_ELEMENT_PROCEDURE = `/${BrowserWritebackService.typeName}/${BrowserWritebackService.method.locateElement.name}`
const RECORD_VERIFICATION_PROCEDURE = `/${BrowserWritebackService.typeName}/${BrowserWritebackService.method.recordVerification.name}`

export class BrowserWritebackClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async applyColor(
    input: { color: string; intent?: string; target: BrowserWritebackTarget },
    options?: RuntimeCallOptions
  ): Promise<{ terminalHandle: string }> {
    const response = await this.transport.unary({
      method: APPLY_COLOR_PROCEDURE,
      payload: toBinary(
        BrowserWritebackApplyColorRequestSchema,
        create(BrowserWritebackApplyColorRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(BrowserWritebackApplyColorResponseSchema, response)
  }

  async applyCss(
    input: {
      changes: BrowserWritebackCssChange[]
      pageUrl: string
      target: BrowserWritebackTarget
    },
    options?: RuntimeCallOptions
  ): Promise<{ terminalHandle: string }> {
    const response = await this.transport.unary({
      method: APPLY_CSS_PROCEDURE,
      payload: toBinary(
        BrowserWritebackApplyCssRequestSchema,
        create(BrowserWritebackApplyCssRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(BrowserWritebackApplyCssResponseSchema, response)
  }

  async locateElement(
    input: {
      evidence: BrowserWritebackElementEvidence
      outerHtml: string
      pageUrl: string
      selector: string
      styles: Record<string, string>
      target: BrowserWritebackTarget
    },
    options?: RuntimeCallOptions
  ): Promise<{ terminalHandle: string }> {
    const response = await this.transport.unary({
      method: LOCATE_ELEMENT_PROCEDURE,
      payload: toBinary(
        BrowserWritebackLocateElementRequestSchema,
        create(BrowserWritebackLocateElementRequestSchema, {
          ...input,
          evidence: create(BrowserWritebackElementEvidenceSchema, {
            ...input.evidence,
            column: input.evidence.column === undefined ? undefined : BigInt(input.evidence.column),
            line: input.evidence.line === undefined ? undefined : BigInt(input.evidence.line)
          }),
          styles: Object.entries(input.styles).map(([name, value]) =>
            create(BrowserWritebackStyleEntrySchema, { name, value })
          )
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(BrowserWritebackLocateElementResponseSchema, response)
  }

  async recordVerification(
    input: {
      detail: string
      pageUrl: string
      success: boolean
      target: BrowserWritebackTarget
      terminalHandle: string
    },
    options?: RuntimeCallOptions
  ): Promise<{ eventId: bigint }> {
    const response = await this.transport.unary({
      method: RECORD_VERIFICATION_PROCEDURE,
      payload: toBinary(
        BrowserWritebackRecordVerificationRequestSchema,
        create(BrowserWritebackRecordVerificationRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(BrowserWritebackRecordVerificationResponseSchema, response)
  }
}

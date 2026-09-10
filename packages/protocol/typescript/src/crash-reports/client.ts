import { create, fromBinary, toBinary, type MessageInitShape } from '@bufbuild/protobuf'

import {
  CrashReportsService,
  CrashReportsServiceGetLatestPendingRequestSchema,
  CrashReportsServiceGetLatestPendingResponseSchema,
  CrashReportsServiceGetLatestReportRequestSchema,
  CrashReportsServiceGetLatestReportResponseSchema,
  CrashReportsServiceDismissRequestSchema,
  CrashReportsServiceDismissResponseSchema,
  CrashReportsServiceRecordBreadcrumbRequestSchema,
  CrashReportsServiceRecordBreadcrumbResponseSchema,
  CrashReportsServiceRecordRendererErrorRequestSchema,
  CrashReportsServiceRecordRendererErrorResponseSchema,
  CrashReportsServiceSubmitRequestSchema,
  CrashReportsServiceSubmitResponseSchema,
  CrashReportsServiceCopyLatestDiagnosticsRequestSchema,
  CrashReportsServiceCopyLatestDiagnosticsResponseSchema
} from '../../generated/agent_start/runtime/v1/crash_reports_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'

export class CrashReportsClient {
  private readonly transport: RuntimeTransport
  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }
  async getLatestPending(
    input: MessageInitShape<typeof CrashReportsServiceGetLatestPendingRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      CrashReportsServiceGetLatestPendingResponseSchema,
      await this.transport.unary({
        method: `/${CrashReportsService.typeName}/${CrashReportsService.method.getLatestPending.name}`,
        payload: toBinary(
          CrashReportsServiceGetLatestPendingRequestSchema,
          create(CrashReportsServiceGetLatestPendingRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async getLatestReport(
    input: MessageInitShape<typeof CrashReportsServiceGetLatestReportRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      CrashReportsServiceGetLatestReportResponseSchema,
      await this.transport.unary({
        method: `/${CrashReportsService.typeName}/${CrashReportsService.method.getLatestReport.name}`,
        payload: toBinary(
          CrashReportsServiceGetLatestReportRequestSchema,
          create(CrashReportsServiceGetLatestReportRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async dismiss(
    input: MessageInitShape<typeof CrashReportsServiceDismissRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      CrashReportsServiceDismissResponseSchema,
      await this.transport.unary({
        method: `/${CrashReportsService.typeName}/${CrashReportsService.method.dismiss.name}`,
        payload: toBinary(
          CrashReportsServiceDismissRequestSchema,
          create(CrashReportsServiceDismissRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async recordBreadcrumb(
    input: MessageInitShape<typeof CrashReportsServiceRecordBreadcrumbRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      CrashReportsServiceRecordBreadcrumbResponseSchema,
      await this.transport.unary({
        method: `/${CrashReportsService.typeName}/${CrashReportsService.method.recordBreadcrumb.name}`,
        payload: toBinary(
          CrashReportsServiceRecordBreadcrumbRequestSchema,
          create(CrashReportsServiceRecordBreadcrumbRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async recordRendererError(
    input: MessageInitShape<typeof CrashReportsServiceRecordRendererErrorRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      CrashReportsServiceRecordRendererErrorResponseSchema,
      await this.transport.unary({
        method: `/${CrashReportsService.typeName}/${CrashReportsService.method.recordRendererError.name}`,
        payload: toBinary(
          CrashReportsServiceRecordRendererErrorRequestSchema,
          create(CrashReportsServiceRecordRendererErrorRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async submit(
    input: MessageInitShape<typeof CrashReportsServiceSubmitRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      CrashReportsServiceSubmitResponseSchema,
      await this.transport.unary({
        method: `/${CrashReportsService.typeName}/${CrashReportsService.method.submit.name}`,
        payload: toBinary(
          CrashReportsServiceSubmitRequestSchema,
          create(CrashReportsServiceSubmitRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async copyLatestDiagnostics(
    input: MessageInitShape<typeof CrashReportsServiceCopyLatestDiagnosticsRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      CrashReportsServiceCopyLatestDiagnosticsResponseSchema,
      await this.transport.unary({
        method: `/${CrashReportsService.typeName}/${CrashReportsService.method.copyLatestDiagnostics.name}`,
        payload: toBinary(
          CrashReportsServiceCopyLatestDiagnosticsRequestSchema,
          create(CrashReportsServiceCopyLatestDiagnosticsRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
}

export type {
  CrashReport,
  CrashReportDetailValue,
  CrashReportDetails,
  CrashReportDiagnosticBundle,
  CrashReportNullableString
} from '../../generated/agent_start/runtime/v1/crash_reports_pb.js'

export {
  CrashReportStatus,
  CrashReportSource,
  RendererErrorReportKind,
  RendererErrorSurface
} from '../../generated/agent_start/runtime/v1/crash_reports_pb.js'

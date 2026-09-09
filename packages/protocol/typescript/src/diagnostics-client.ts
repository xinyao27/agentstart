import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  DiagnosticsServiceCollectBundleRequestSchema,
  DiagnosticsServiceCollectBundleResponseSchema,
  DiagnosticsServiceDiscardBundlePreviewRequestSchema,
  DiagnosticsServiceDiscardBundlePreviewResponseSchema,
  DiagnosticsServiceGetStatusRequestSchema,
  DiagnosticsServiceGetStatusResponseSchema,
  DiagnosticsServiceOpenBundlePreviewRequestSchema,
  DiagnosticsServiceOpenBundlePreviewResponseSchema,
  DiagnosticsServiceUploadBundleRequestSchema,
  DiagnosticsServiceUploadBundleResponseSchema,
  DiagnosticsService,
  GetMemorySnapshotRequestSchema,
  GetMemorySnapshotResponseSchema,
  type GetMemorySnapshotResponse
} from '../generated/yiru/runtime/v1/diagnostics_pb.js'
import {
  diagnosticsBundle,
  diagnosticsLookbackMinutes,
  diagnosticsStatus,
  diagnosticsUpload,
  type DiagnosticsBundle,
  type DiagnosticsStatus,
  type DiagnosticsUploadResult
} from './diagnostics-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_MEMORY_SNAPSHOT_PROCEDURE = `/${DiagnosticsService.typeName}/${DiagnosticsService.method.getMemorySnapshot.name}`
const GET_STATUS_PROCEDURE = `/${DiagnosticsService.typeName}/${DiagnosticsService.method.getStatus.name}`
const COLLECT_BUNDLE_PROCEDURE = `/${DiagnosticsService.typeName}/${DiagnosticsService.method.collectBundle.name}`
const OPEN_BUNDLE_PREVIEW_PROCEDURE = `/${DiagnosticsService.typeName}/${DiagnosticsService.method.openBundlePreview.name}`
const DISCARD_BUNDLE_PREVIEW_PROCEDURE = `/${DiagnosticsService.typeName}/${DiagnosticsService.method.discardBundlePreview.name}`
const UPLOAD_BUNDLE_PROCEDURE = `/${DiagnosticsService.typeName}/${DiagnosticsService.method.uploadBundle.name}`

export class DiagnosticsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getMemorySnapshot(options?: RuntimeCallOptions): Promise<GetMemorySnapshotResponse> {
    const payload = toBinary(GetMemorySnapshotRequestSchema, create(GetMemorySnapshotRequestSchema))
    const response = await this.transport.unary({
      method: GET_MEMORY_SNAPSHOT_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    return fromBinary(GetMemorySnapshotResponseSchema, response)
  }

  async getStatus(options?: RuntimeCallOptions): Promise<DiagnosticsStatus> {
    const response = await this.transport.unary({
      method: GET_STATUS_PROCEDURE,
      payload: toBinary(
        DiagnosticsServiceGetStatusRequestSchema,
        create(DiagnosticsServiceGetStatusRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return diagnosticsStatus(fromBinary(DiagnosticsServiceGetStatusResponseSchema, response))
  }

  async collectBundle(
    lookbackMinutes?: number,
    options?: RuntimeCallOptions
  ): Promise<DiagnosticsBundle> {
    const response = await this.transport.unary({
      method: COLLECT_BUNDLE_PROCEDURE,
      payload: toBinary(
        DiagnosticsServiceCollectBundleRequestSchema,
        create(DiagnosticsServiceCollectBundleRequestSchema, {
          lookbackMinutes: diagnosticsLookbackMinutes(lookbackMinutes)
        })
      ),
      ...(options ? { options } : {})
    })
    return diagnosticsBundle(fromBinary(DiagnosticsServiceCollectBundleResponseSchema, response))
  }

  async openBundlePreview(bundleSubmissionId: string, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: OPEN_BUNDLE_PREVIEW_PROCEDURE,
      payload: toBinary(
        DiagnosticsServiceOpenBundlePreviewRequestSchema,
        create(DiagnosticsServiceOpenBundlePreviewRequestSchema, { bundleSubmissionId })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(DiagnosticsServiceOpenBundlePreviewResponseSchema, response)
  }

  async discardBundlePreview(
    bundleSubmissionId: string,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: DISCARD_BUNDLE_PREVIEW_PROCEDURE,
      payload: toBinary(
        DiagnosticsServiceDiscardBundlePreviewRequestSchema,
        create(DiagnosticsServiceDiscardBundlePreviewRequestSchema, { bundleSubmissionId })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(DiagnosticsServiceDiscardBundlePreviewResponseSchema, response)
  }

  async uploadBundle(
    bundleSubmissionId: string,
    options?: RuntimeCallOptions
  ): Promise<DiagnosticsUploadResult> {
    const response = await this.transport.unary({
      method: UPLOAD_BUNDLE_PROCEDURE,
      payload: toBinary(
        DiagnosticsServiceUploadBundleRequestSchema,
        create(DiagnosticsServiceUploadBundleRequestSchema, { bundleSubmissionId })
      ),
      ...(options ? { options } : {})
    })
    return diagnosticsUpload(fromBinary(DiagnosticsServiceUploadBundleResponseSchema, response))
  }
}

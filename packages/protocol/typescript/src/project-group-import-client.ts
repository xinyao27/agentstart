import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ProjectGroupService,
  ProjectGroupServiceCancelNestedScanRequestSchema,
  ProjectGroupServiceCancelNestedScanResponseSchema,
  ProjectGroupServiceImportNestedRequestSchema,
  ProjectGroupServiceImportNestedResponseSchema,
  ProjectGroupServiceScanNestedRequestSchema,
  ProjectGroupServiceScanNestedResponseSchema,
  ProjectGroupScanOptionsSchema
} from '../generated/agent_start/runtime/v1/project_group_pb.js'
import { nestedScanResult, type NestedRepoScanResultValue } from './project-group-scan-values.js'
import { importResult, protocolImportMode } from './project-group-values.js'
import type {
  ProjectGroupImportNestedInput,
  ProjectGroupImportResultValue,
  ProjectGroupScanInput
} from './project-group-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export type ProjectGroupCancelNestedScanResult = { cancelled: boolean }

const SCAN_NESTED_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.scanNested.name}`
const CANCEL_NESTED_SCAN_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.cancelNestedScan.name}`
const IMPORT_NESTED_PROCEDURE = `/${ProjectGroupService.typeName}/${ProjectGroupService.method.importNested.name}`

export class ProjectGroupImportClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async scanNested(
    input: ProjectGroupScanInput,
    options?: RuntimeCallOptions
  ): Promise<NestedRepoScanResultValue> {
    const response = fromBinary(
      ProjectGroupServiceScanNestedResponseSchema,
      await this.transport.unary({
        method: SCAN_NESTED_PROCEDURE,
        payload: toBinary(
          ProjectGroupServiceScanNestedRequestSchema,
          create(ProjectGroupServiceScanNestedRequestSchema, {
            path: input.path,
            ...(input.scanId === undefined ? {} : { scanId: input.scanId }),
            ...(input.options === undefined
              ? {}
              : {
                  options: create(ProjectGroupScanOptionsSchema, {
                    ...(input.options.maxDepth === undefined
                      ? {}
                      : { maxDepth: input.options.maxDepth }),
                    ...(input.options.maxRepos === undefined
                      ? {}
                      : { maxRepos: input.options.maxRepos }),
                    ...(input.options.timeoutMs === undefined
                      ? {}
                      : { timeoutMs: BigInt(input.options.timeoutMs) })
                  })
                })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return nestedScanResult(response)
  }

  async cancelNestedScan(
    scanId: string,
    options?: RuntimeCallOptions
  ): Promise<ProjectGroupCancelNestedScanResult> {
    const response = fromBinary(
      ProjectGroupServiceCancelNestedScanResponseSchema,
      await this.transport.unary({
        method: CANCEL_NESTED_SCAN_PROCEDURE,
        payload: toBinary(
          ProjectGroupServiceCancelNestedScanRequestSchema,
          create(ProjectGroupServiceCancelNestedScanRequestSchema, { scanId })
        ),
        ...(options ? { options } : {})
      })
    )
    return { cancelled: response.cancelled }
  }

  async importNested(
    input: ProjectGroupImportNestedInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectGroupImportResultValue> {
    const response = fromBinary(
      ProjectGroupServiceImportNestedResponseSchema,
      await this.transport.unary({
        method: IMPORT_NESTED_PROCEDURE,
        payload: toBinary(
          ProjectGroupServiceImportNestedRequestSchema,
          create(ProjectGroupServiceImportNestedRequestSchema, {
            expectedRevision: expectedRevision(input.expectedRevision),
            parentPath: input.parentPath,
            groupName: input.groupName,
            projectPaths: [...input.projectPaths],
            mode: protocolImportMode(input.mode),
            ...(input.scanId === undefined ? {} : { scanId: input.scanId })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return importResult(response)
  }
}

export function expectedRevision(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Expected catalog revision must be a nonnegative safe integer')
  }
  return BigInt(value)
}

import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ProjectContextService,
  ProjectContextServiceResolveRequestSchema,
  ProjectContextServiceResolveResponseSchema
} from '../generated/yiru/runtime/v1/project_context_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export const PROJECT_CONTEXT_PROTOCOL_CAPABILITY = 'projectContext.protobuf.v1' as const

const RESOLVE_PROCEDURE = `/${ProjectContextService.typeName}/${ProjectContextService.method.resolve.name}`

export type ProjectContextMatchValue = Readonly<{
  displayName: string
  path: string
  projectId: string
}>

export class ProjectContextClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async resolve(
    input: { canonicalKey: string },
    options?: RuntimeCallOptions
  ): Promise<{ matches: ProjectContextMatchValue[] }> {
    const canonicalKey = input.canonicalKey.trim()
    if (canonicalKey.length === 0) {
      throw new TypeError('Project context key must not be empty')
    }
    const response = await this.transport.unary({
      method: RESOLVE_PROCEDURE,
      payload: toBinary(
        ProjectContextServiceResolveRequestSchema,
        create(ProjectContextServiceResolveRequestSchema, { canonicalKey })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(ProjectContextServiceResolveResponseSchema, response)
    return {
      matches: decoded.matches.map((match) => ({
        displayName: match.displayName,
        path: match.path,
        projectId: match.projectId
      }))
    }
  }
}

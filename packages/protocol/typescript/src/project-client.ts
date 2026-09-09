import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ProjectService,
  ProjectServiceListRequestSchema,
  ProjectServiceListResponseSchema,
  ProjectServiceUpdateRequestSchema,
  ProjectServiceUpdateResponseSchema
} from '../generated/yiru/runtime/v1/project_pb.js'
import { RuntimeProtocolError } from './error.js'
import {
  PROJECT_PROTOCOL_CAPABILITY,
  projectValue,
  type ProjectRuntimePreferenceValue,
  type ProjectValue
} from './project-values.js'
import { safeNumber } from './shell-state-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export { PROJECT_PROTOCOL_CAPABILITY }

const LIST_PROCEDURE = `/${ProjectService.typeName}/${ProjectService.method.list.name}`
const UPDATE_PROCEDURE = `/${ProjectService.typeName}/${ProjectService.method.update.name}`

export type ProjectListResult = Readonly<{
  projects: ProjectValue[]
  revision: number
}>

export type ProjectUpdateInput = Readonly<{
  expectedRevision: number
  projectId: string
  updates: { localWindowsRuntimePreference?: ProjectRuntimePreferenceValue }
}>

export type ProjectUpdateResult = Readonly<{
  project: ProjectValue
  revision: number
}>

export class ProjectClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(options?: RuntimeCallOptions): Promise<ProjectListResult> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(ProjectServiceListRequestSchema, create(ProjectServiceListRequestSchema)),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(ProjectServiceListResponseSchema, response)
    return {
      projects: decoded.projects.map(projectValue),
      revision: safeNumber(decoded.revision, 'Project catalog revision')
    }
  }

  async update(
    input: ProjectUpdateInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectUpdateResult> {
    const response = await this.transport.unary({
      method: UPDATE_PROCEDURE,
      payload: toBinary(
        ProjectServiceUpdateRequestSchema,
        create(ProjectServiceUpdateRequestSchema, {
          expectedRevision: BigInt(input.expectedRevision),
          projectId: input.projectId,
          // Why: the legacy surface requires the updates object to be present
          // even when it carries no fields, so message presence guards that gate.
          updates: {
            localWindowsRuntimePreference: runtimePreference(input.updates)
          }
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(ProjectServiceUpdateResponseSchema, response)
    if (!decoded.project) {
      throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'Project update returned no project')
    }
    return {
      project: projectValue(decoded.project),
      revision: safeNumber(decoded.revision, 'Project catalog revision')
    }
  }
}

function runtimePreference(updates: ProjectUpdateInput['updates']) {
  const preference = updates.localWindowsRuntimePreference
  if (preference === undefined) {
    return undefined
  }
  switch (preference.kind) {
    case 'inherit-global':
      return { kind: { case: 'inheritGlobal' as const, value: true } }
    case 'windows-host':
      return { kind: { case: 'windowsHost' as const, value: true } }
    case 'wsl':
      return { kind: { case: 'wslDistro' as const, value: preference.distro } }
  }
}

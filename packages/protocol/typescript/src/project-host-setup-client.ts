import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ProjectHostSetupKind,
  ProjectHostSetupMethod,
  ProjectHostSetupService,
  ProjectHostSetupServiceCloneRequestSchema,
  ProjectHostSetupServiceCreateRequestSchema,
  ProjectHostSetupServiceDeleteRequestSchema,
  ProjectHostSetupServiceListRequestSchema,
  ProjectHostSetupServiceListResponseSchema,
  ProjectHostSetupServiceMutationResponseSchema,
  ProjectHostSetupServiceSetupExistingFolderRequestSchema,
  ProjectHostSetupServiceUpdateRequestSchema,
  ProjectHostSetupState,
  ProjectHostSetupUpdatesSchema
} from '../generated/agent_start/runtime/v1/project_host_setup_pb.js'
import { RuntimeProtocolError } from './error.js'
import {
  projectHostSetupList,
  projectHostSetupMutation,
  type ProjectHostSetupListResultValue,
  type ProjectHostSetupMutationValue,
  type ProjectHostSetupMethodValue,
  type ProjectHostSetupStateValue
} from './project-host-setup-values.js'
import type { RepoKindValue } from './repo-types.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const LIST_PROCEDURE = `/${ProjectHostSetupService.typeName}/${ProjectHostSetupService.method.list.name}`
const CREATE_PROCEDURE = `/${ProjectHostSetupService.typeName}/${ProjectHostSetupService.method.create.name}`
const SETUP_EXISTING_FOLDER_PROCEDURE = `/${ProjectHostSetupService.typeName}/${ProjectHostSetupService.method.setupExistingFolder.name}`
const CLONE_PROCEDURE = `/${ProjectHostSetupService.typeName}/${ProjectHostSetupService.method.clone.name}`
const UPDATE_PROCEDURE = `/${ProjectHostSetupService.typeName}/${ProjectHostSetupService.method.update.name}`
const DELETE_PROCEDURE = `/${ProjectHostSetupService.typeName}/${ProjectHostSetupService.method.delete.name}`

export type ProjectHostSetupCreateInput = {
  expectedRevision: number
  projectId: string
  hostId: string
  displayName?: string
  gitUsername?: string
  kind?: RepoKindValue
  path?: string
  setupId?: string
  setupMethod?: Exclude<ProjectHostSetupMethodValue, 'legacy-repo'>
  setupState?: ProjectHostSetupStateValue
  worktreeBasePath?: string
}
export type ProjectHostSetupExistingFolderInput = {
  expectedRevision: number
  projectId: string
  hostId: string
  path: string
  kind?: RepoKindValue
  setupMethod?: 'imported-existing-folder' | 'cloned'
}
export type ProjectHostSetupCloneInput = {
  expectedRevision: number
  projectId: string
  hostId: string
  url: string
  destination: string
}
export type ProjectHostSetupUpdateInput = {
  expectedRevision: number
  setupId: string
  updates: Partial<{
    displayName: string
    gitUsername: string
    kind: RepoKindValue
    path: string
    setupMethod: ProjectHostSetupMethodValue
    setupState: ProjectHostSetupStateValue
    worktreeBasePath: string
  }>
}
export type ProjectHostSetupDeleteInput = {
  expectedRevision: number
  setupId: string
}

export class ProjectHostSetupClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(options?: RuntimeCallOptions): Promise<ProjectHostSetupListResultValue> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(
        ProjectHostSetupServiceListRequestSchema,
        create(ProjectHostSetupServiceListRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return projectHostSetupList(fromBinary(ProjectHostSetupServiceListResponseSchema, response))
  }

  async create(
    input: ProjectHostSetupCreateInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectHostSetupMutationValue> {
    const request = create(ProjectHostSetupServiceCreateRequestSchema, {
      expectedRevision: revision(input.expectedRevision),
      projectId: input.projectId,
      hostId: input.hostId,
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.gitUsername === undefined ? {} : { gitUsername: input.gitUsername }),
      ...optionalKind(input.kind),
      ...(input.path === undefined ? {} : { path: input.path }),
      ...(input.setupId === undefined ? {} : { setupId: input.setupId }),
      ...optionalMethod(input.setupMethod),
      ...optionalState(input.setupState),
      ...(input.worktreeBasePath === undefined ? {} : { worktreeBasePath: input.worktreeBasePath })
    })
    return this.send(
      CREATE_PROCEDURE,
      toBinary(ProjectHostSetupServiceCreateRequestSchema, request),
      options
    )
  }

  async setupExistingFolder(
    input: ProjectHostSetupExistingFolderInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectHostSetupMutationValue> {
    const request = create(ProjectHostSetupServiceSetupExistingFolderRequestSchema, {
      expectedRevision: revision(input.expectedRevision),
      projectId: input.projectId,
      hostId: input.hostId,
      path: input.path,
      ...optionalKind(input.kind),
      ...optionalMethod(input.setupMethod)
    })
    return this.send(
      SETUP_EXISTING_FOLDER_PROCEDURE,
      toBinary(ProjectHostSetupServiceSetupExistingFolderRequestSchema, request),
      options
    )
  }

  async clone(
    input: ProjectHostSetupCloneInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectHostSetupMutationValue> {
    const request = create(ProjectHostSetupServiceCloneRequestSchema, {
      expectedRevision: revision(input.expectedRevision),
      projectId: input.projectId,
      hostId: input.hostId,
      url: input.url,
      destination: input.destination
    })
    return this.send(
      CLONE_PROCEDURE,
      toBinary(ProjectHostSetupServiceCloneRequestSchema, request),
      options
    )
  }

  async update(
    input: ProjectHostSetupUpdateInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectHostSetupMutationValue> {
    const updates = input.updates
    const request = create(ProjectHostSetupServiceUpdateRequestSchema, {
      expectedRevision: revision(input.expectedRevision),
      setupId: input.setupId,
      updates: create(ProjectHostSetupUpdatesSchema, {
        ...(updates.displayName === undefined ? {} : { displayName: updates.displayName }),
        ...(updates.gitUsername === undefined ? {} : { gitUsername: updates.gitUsername }),
        ...optionalKind(updates.kind),
        ...(updates.path === undefined ? {} : { path: updates.path }),
        ...optionalMethod(updates.setupMethod),
        ...optionalState(updates.setupState),
        ...(updates.worktreeBasePath === undefined
          ? {}
          : { worktreeBasePath: updates.worktreeBasePath })
      })
    })
    return this.send(
      UPDATE_PROCEDURE,
      toBinary(ProjectHostSetupServiceUpdateRequestSchema, request),
      options
    )
  }

  async delete(
    input: ProjectHostSetupDeleteInput,
    options?: RuntimeCallOptions
  ): Promise<ProjectHostSetupMutationValue> {
    const request = create(ProjectHostSetupServiceDeleteRequestSchema, {
      expectedRevision: revision(input.expectedRevision),
      setupId: input.setupId
    })
    return this.send(
      DELETE_PROCEDURE,
      toBinary(ProjectHostSetupServiceDeleteRequestSchema, request),
      options
    )
  }

  private async send(
    procedure: string,
    payload: Uint8Array,
    options?: RuntimeCallOptions
  ): Promise<ProjectHostSetupMutationValue> {
    const response = await this.transport.unary({
      method: procedure,
      payload,
      ...(options ? { options } : {})
    })
    return projectHostSetupMutation(
      fromBinary(ProjectHostSetupServiceMutationResponseSchema, response)
    )
  }
}

function optionalKind(
  value: RepoKindValue | undefined
): { kind?: ProjectHostSetupKind } | Record<string, never> {
  switch (value) {
    case 'folder':
      return { kind: ProjectHostSetupKind.FOLDER }
    case 'git':
      return { kind: ProjectHostSetupKind.GIT }
    case undefined:
      return {}
  }
}

function optionalMethod(
  value: ProjectHostSetupMethodValue | undefined
): { setupMethod?: ProjectHostSetupMethod } | Record<string, never> {
  switch (value) {
    case 'legacy-repo':
      return { setupMethod: ProjectHostSetupMethod.LEGACY_REPO }
    case 'imported-existing-folder':
      return { setupMethod: ProjectHostSetupMethod.IMPORTED_EXISTING_FOLDER }
    case 'cloned':
      return { setupMethod: ProjectHostSetupMethod.CLONED }
    case 'provisioned':
      return { setupMethod: ProjectHostSetupMethod.PROVISIONED }
    case undefined:
      return {}
  }
}

function optionalState(
  value: ProjectHostSetupStateValue | undefined
): { setupState?: ProjectHostSetupState } | Record<string, never> {
  switch (value) {
    case 'ready':
      return { setupState: ProjectHostSetupState.READY }
    case 'not-set-up':
      return { setupState: ProjectHostSetupState.NOT_SET_UP }
    case 'setting-up':
      return { setupState: ProjectHostSetupState.SETTING_UP }
    case 'error':
      return { setupState: ProjectHostSetupState.ERROR }
    case 'unsupported':
      return { setupState: ProjectHostSetupState.UNSUPPORTED }
    case undefined:
      return {}
  }
}

// Why: the daemon rejects negative revisions and revisions beyond i64, so the
// caller-side check mirrors the legacy zod contract before the wire round-trip.
function revision(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidRequest('Expected revision must be a non-negative safe integer')
  }
  return BigInt(value)
}

function invalidRequest(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, message)
}

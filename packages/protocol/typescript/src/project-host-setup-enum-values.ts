import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ProjectHostSetupKind,
  ProjectHostSetupMethod,
  ProjectHostSetupState,
  ProjectHostSetupWorktreeVisibility,
  type ProjectHostSetupRecord,
  type ProjectHostSetupRepo
} from '../generated/yiru/runtime/v1/project_host_setup_pb.js'
import { RuntimeProtocolError } from './error.js'
import type {
  ProjectHostSetupHostId,
  ProjectHostSetupMethodValue,
  ProjectHostSetupStateValue
} from './project-host-setup-values.js'
import type { RepoKindValue } from './repo-types.js'

export function kind(value: ProjectHostSetupRecord['kind']): RepoKindValue | undefined {
  switch (value) {
    case ProjectHostSetupKind.FOLDER:
      return 'folder'
    case ProjectHostSetupKind.GIT:
      return 'git'
    case ProjectHostSetupKind.UNSPECIFIED:
    case undefined:
      return undefined
  }
  throw invalidResponse('Project host setup kind is unknown')
}

export function repoKind(value: ProjectHostSetupRepo['kind']): RepoKindValue {
  return kind(value) ?? throwInvalidKind()
}

function throwInvalidKind(): never {
  throw invalidResponse('Project host setup repo kind is missing')
}

export function state(value: ProjectHostSetupRecord['setupState']): ProjectHostSetupStateValue {
  switch (value) {
    case ProjectHostSetupState.READY:
      return 'ready'
    case ProjectHostSetupState.NOT_SET_UP:
      return 'not-set-up'
    case ProjectHostSetupState.SETTING_UP:
      return 'setting-up'
    case ProjectHostSetupState.ERROR:
      return 'error'
    case ProjectHostSetupState.UNSUPPORTED:
      return 'unsupported'
    case ProjectHostSetupState.UNSPECIFIED:
      break
  }
  throw invalidResponse('Project host setup state is missing')
}

export function method(value: ProjectHostSetupRecord['setupMethod']): ProjectHostSetupMethodValue {
  switch (value) {
    case ProjectHostSetupMethod.LEGACY_REPO:
      return 'legacy-repo'
    case ProjectHostSetupMethod.IMPORTED_EXISTING_FOLDER:
      return 'imported-existing-folder'
    case ProjectHostSetupMethod.CLONED:
      return 'cloned'
    case ProjectHostSetupMethod.PROVISIONED:
      return 'provisioned'
    case ProjectHostSetupMethod.UNSPECIFIED:
      break
  }
  throw invalidResponse('Project host setup method is missing')
}

// Why: the repo row may only carry import provenance — the legacy zod contract
// rejected anything else, so unknown provenance stays a decode failure.
export function repoSetupMethod(
  value: ProjectHostSetupRepo['projectHostSetupMethod']
): 'imported-existing-folder' | 'cloned' | undefined {
  switch (value) {
    case ProjectHostSetupMethod.IMPORTED_EXISTING_FOLDER:
      return 'imported-existing-folder'
    case ProjectHostSetupMethod.CLONED:
      return 'cloned'
    case undefined:
    case ProjectHostSetupMethod.UNSPECIFIED:
      return undefined
    case ProjectHostSetupMethod.LEGACY_REPO:
    case ProjectHostSetupMethod.PROVISIONED:
      break
  }
  throw invalidResponse('Project host setup repo method is invalid')
}

export function externalWorktreeVisibility(
  value: ProjectHostSetupRepo['externalWorktreeVisibility']
): {} | { externalWorktreeVisibility: 'hide' | 'show' } {
  switch (value) {
    case ProjectHostSetupWorktreeVisibility.HIDE:
      return { externalWorktreeVisibility: 'hide' }
    case ProjectHostSetupWorktreeVisibility.SHOW:
      return { externalWorktreeVisibility: 'show' }
    case ProjectHostSetupWorktreeVisibility.UNSPECIFIED:
      return {}
  }
  throw invalidResponse('Project host setup visibility is unknown')
}

export function hostId(value: string, message: string): ProjectHostSetupHostId {
  if (isHostId(value)) {
    return value
  }
  throw invalidResponse(message)
}

function isHostId(value: string): value is ProjectHostSetupHostId {
  if (value === 'local') {
    return true
  }
  if (!/^(?:runtime|ssh|wsl):(.+)$/.test(value)) {
    return false
  }
  try {
    return decodeURIComponent(value.slice(value.indexOf(':') + 1)).length > 0
  } catch {
    return false
  }
}

export function revision(value: bigint): number {
  const decoded = Number(value)
  if (!Number.isSafeInteger(decoded)) {
    throw invalidResponse('Project host setup revision is outside the safe integer range')
  }
  return decoded
}

export function timestamp(value: bigint): number {
  const decoded = Number(value)
  if (!Number.isSafeInteger(decoded)) {
    throw invalidResponse('Project host setup timestamp is outside the safe integer range')
  }
  return decoded
}

export function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

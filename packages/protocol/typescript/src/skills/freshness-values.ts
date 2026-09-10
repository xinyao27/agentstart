import {
  SkillFreshnessStatus as ProtocolFreshnessStatus,
  SkillUpdateFailureKind as ProtocolFailureKind,
  SkillUpdateOperation as ProtocolOperation,
  SkillUpdateStartFailureReason,
  type SkillFreshnessInventory as ProtocolFreshnessInventory,
  type SkillUpdateRun as ProtocolUpdateRun,
  type SkillUpdateRunError as ProtocolRunError,
  type SkillUpdateRunSubject as ProtocolRunSubject,
  type SkillsServiceManageStartInstallRunResponse,
  type SkillsServiceManageStartRemoveRunResponse,
  type SkillsServiceManageStartUpdateRunResponse
} from '../../generated/agent_start/runtime/v1/skills_pb.js'
import {
  invalidResponse,
  optionalTimestamp,
  provider,
  sourceKind,
  topology,
  type SkillInstallationTopology,
  type SkillProvider,
  type SkillSourceKind
} from './discovery-values.js'

export type SkillFreshnessStatus =
  | 'current'
  | 'outdated'
  | 'newer-known'
  | 'unrecognized'
  | 'inaccessible'

export type SkillFreshnessInstallation = {
  id: string
  name: string
  rootId: string
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  unresolvedPath: string
  resolvedPath: string | null
  physicalIdentity: string | null
  topology: SkillInstallationTopology
  status: SkillFreshnessStatus
  installedReleaseRevision: number | null
  installedAppVersion: string | null
  currentReleaseRevision: number
  currentPackageDigest: string
  currentAppVersion: string
  observedPackageDigest: string | null
  observedGitTreeSha: string | null
  errorCategory: string | null
}

export type SkillFreshnessInventory = {
  installations: SkillFreshnessInstallation[]
  eligibleUpdateNames: string[]
  scannedAt: number
}

export type SkillUpdateOperation = 'update' | 'install' | 'remove'

export type SkillUpdateRunSubject = {
  operation: SkillUpdateOperation
  names: string[]
  source?: string
}

export type SkillUpdateFailure =
  | { kind: 'launch-failed'; detail: string }
  | { kind: 'command-exited'; exitCode: number | null }
  | { kind: 'incomplete' }

export type SkillUpdateRun =
  | { state: 'idle' }
  | {
      state: 'running'
      subject: SkillUpdateRunSubject
      startedAt: number
      output: string
      stopping?: boolean
    }
  | { state: 'success'; subject: SkillUpdateRunSubject; finishedAt: number; output: string }
  | {
      state: 'error'
      subject: SkillUpdateRunSubject
      finishedAt: number
      output: string
      failedNames: string[]
      failure: SkillUpdateFailure
    }

export type SkillUpdateStartResult =
  | { started: true }
  | {
      started: false
      reason: 'already-running' | 'invalid-names' | 'invalid-source' | 'invalid-scope'
    }

export function decodeFreshnessInventory(
  inventory: ProtocolFreshnessInventory | undefined
): SkillFreshnessInventory {
  if (!inventory) {
    throw invalidResponse('Skill freshness inventory is missing')
  }
  return {
    installations: inventory.installations.map(freshnessInstallation),
    eligibleUpdateNames: [...inventory.eligibleUpdateNames],
    scannedAt: Number(inventory.scannedAt)
  }
}

export function decodeStartResult(
  response:
    | SkillsServiceManageStartUpdateRunResponse
    | SkillsServiceManageStartInstallRunResponse
    | SkillsServiceManageStartRemoveRunResponse
): SkillUpdateStartResult {
  const result = response.result
  if (!result) {
    throw invalidResponse('Skill run start result is missing')
  }
  if (result.started) {
    return { started: true }
  }
  switch (result.reason) {
    case SkillUpdateStartFailureReason.ALREADY_RUNNING:
      return { started: false, reason: 'already-running' }
    case SkillUpdateStartFailureReason.INVALID_NAMES:
      return { started: false, reason: 'invalid-names' }
    case SkillUpdateStartFailureReason.INVALID_SOURCE:
      return { started: false, reason: 'invalid-source' }
    case SkillUpdateStartFailureReason.INVALID_SCOPE:
      return { started: false, reason: 'invalid-scope' }
    case SkillUpdateStartFailureReason.UNSPECIFIED:
      throw invalidResponse('Skill run start failure reason is missing')
  }
  throw invalidResponse('Skill run start failure reason is unknown')
}

export function decodeUpdateRun(run: ProtocolUpdateRun | undefined): SkillUpdateRun {
  const state = run?.state
  if (!state) {
    throw invalidResponse('Skill update run state is missing')
  }
  switch (state.case) {
    case 'idle':
      return { state: 'idle' }
    case 'running':
      return {
        state: 'running',
        subject: runSubject(state.value.subject),
        startedAt: Number(state.value.startedAt),
        output: state.value.output,
        ...(state.value.stopping ? { stopping: true } : {})
      }
    case 'success':
      return {
        state: 'success',
        subject: runSubject(state.value.subject),
        finishedAt: Number(state.value.finishedAt),
        output: state.value.output
      }
    case 'error':
      return {
        state: 'error',
        subject: runSubject(state.value.subject),
        finishedAt: Number(state.value.finishedAt),
        output: state.value.output,
        failedNames: [...state.value.failedNames],
        failure: updateFailure(state.value)
      }
  }
  throw invalidResponse('Skill update run state is unknown')
}

function freshnessInstallation(
  installation: ProtocolFreshnessInventory['installations'][number]
): SkillFreshnessInstallation {
  return {
    id: installation.id,
    name: installation.name,
    rootId: installation.rootId,
    providers: installation.providers.map(provider),
    sourceKind: sourceKind(installation.sourceKind),
    sourceLabel: installation.sourceLabel,
    unresolvedPath: installation.unresolvedPath,
    resolvedPath: installation.resolvedPath ?? null,
    physicalIdentity: installation.physicalIdentity ?? null,
    topology: topology(installation.topology),
    status: freshnessStatus(installation.status),
    installedReleaseRevision: optionalTimestamp(installation.installedReleaseRevision),
    installedAppVersion: installation.installedAppVersion ?? null,
    currentReleaseRevision: Number(installation.currentReleaseRevision),
    currentPackageDigest: installation.currentPackageDigest,
    currentAppVersion: installation.currentAppVersion,
    observedPackageDigest: installation.observedPackageDigest ?? null,
    observedGitTreeSha: installation.observedGitTreeSha ?? null,
    errorCategory: installation.errorCategory ?? null
  }
}

function runSubject(subject: ProtocolRunSubject | undefined): SkillUpdateRunSubject {
  if (!subject) {
    throw invalidResponse('Skill update run subject is missing')
  }
  return {
    operation: runOperation(subject.operation),
    names: [...subject.names],
    ...(subject.source ? { source: subject.source } : {})
  }
}

function runOperation(value: number): SkillUpdateOperation {
  switch (value) {
    case ProtocolOperation.UPDATE:
      return 'update'
    case ProtocolOperation.INSTALL:
      return 'install'
    case ProtocolOperation.REMOVE:
      return 'remove'
    case ProtocolOperation.UNSPECIFIED:
      throw invalidResponse('Skill update operation is unspecified')
  }
  throw invalidResponse('Skill update operation is unknown')
}

function updateFailure(error: ProtocolRunError): SkillUpdateFailure {
  switch (error.kind) {
    case ProtocolFailureKind.LAUNCH_FAILED:
      return { kind: 'launch-failed', detail: error.detail ?? '' }
    case ProtocolFailureKind.COMMAND_EXITED:
      return { kind: 'command-exited', exitCode: error.exitCode ?? null }
    case ProtocolFailureKind.INCOMPLETE:
      return { kind: 'incomplete' }
    case ProtocolFailureKind.UNSPECIFIED:
      throw invalidResponse('Skill update failure kind is unspecified')
  }
  throw invalidResponse('Skill update failure kind is unknown')
}

function freshnessStatus(value: number): SkillFreshnessStatus {
  switch (value) {
    case ProtocolFreshnessStatus.CURRENT:
      return 'current'
    case ProtocolFreshnessStatus.OUTDATED:
      return 'outdated'
    case ProtocolFreshnessStatus.NEWER_KNOWN:
      return 'newer-known'
    case ProtocolFreshnessStatus.UNRECOGNIZED:
      return 'unrecognized'
    case ProtocolFreshnessStatus.INACCESSIBLE:
      return 'inaccessible'
    case ProtocolFreshnessStatus.UNSPECIFIED:
      throw invalidResponse('Skill freshness status is unspecified')
  }
  throw invalidResponse('Skill freshness status is unknown')
}

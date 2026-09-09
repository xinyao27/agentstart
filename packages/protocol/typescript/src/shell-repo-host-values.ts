import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ShellRepoHostReorderStatus,
  type ShellRepoHostServicePickedResponse,
  type ShellRepoHostServiceRemovedForHostResponse,
  type ShellRepoHostServiceReorderedForHostResponse
} from '../generated/yiru/runtime/v1/shell_repo_host_pb.js'
import { RuntimeProtocolError } from './error.js'

export const SHELL_REPO_HOST_PROTOCOL_CAPABILITY = 'shell.repoHost.protobuf.v1' as const

export type ShellRepoHostRemoveForHostInput = {
  expectedRevision: number
  hostId: string
  repoId: string
}

export type ShellRepoHostRemoveForHostResult = { removed: boolean; revision: number }

export type ShellRepoHostReorderForHostInput = {
  expectedRevision: number
  hostId: string
  orderedIds: string[]
}

export type ShellRepoHostReorderStatusValue = 'applied' | 'rejected'

export type ShellRepoHostReorderForHostResult = {
  revision?: number
  status: ShellRepoHostReorderStatusValue
}

export function shellRepoHostPickedPath(value: ShellRepoHostServicePickedResponse): string | null {
  // Why: an absent path is the user cancelling the native picker — or the picker
  // being unavailable on this host — and stays distinct from an empty selection.
  return value.path ?? null
}

export function shellRepoHostRemoved(
  value: ShellRepoHostServiceRemovedForHostResponse
): ShellRepoHostRemoveForHostResult {
  return { removed: value.removed, revision: revision(value.revision, 'removeForHost revision') }
}

export function shellRepoHostReordered(
  value: ShellRepoHostServiceReorderedForHostResponse
): ShellRepoHostReorderForHostResult {
  return {
    ...(value.revision === undefined
      ? {}
      : { revision: revision(value.revision, 'reorderForHost revision') }),
    status: reorderStatus(value.status)
  }
}

// Why: the daemon rejects negative revisions and revisions beyond i64, so the
// caller-side check mirrors the legacy zod contract before the wire round-trip.
export function shellRepoHostRevision(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidRequest('Expected revision must be a non-negative safe integer')
  }
  return BigInt(value)
}

function reorderStatus(value: ShellRepoHostReorderStatus): ShellRepoHostReorderStatusValue {
  switch (value) {
    case ShellRepoHostReorderStatus.APPLIED:
      return 'applied'
    case ShellRepoHostReorderStatus.REJECTED:
      return 'rejected'
    case ShellRepoHostReorderStatus.UNSPECIFIED:
      break
  }
  throw invalidResponse('Shell repo host reorder status is missing')
}

function revision(value: bigint, label: string): number {
  const revision = Number(value)
  if (!Number.isSafeInteger(revision)) {
    throw invalidResponse(`${label} is outside the safe integer range`)
  }
  return revision
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

function invalidRequest(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, message)
}

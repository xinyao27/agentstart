import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type { RepoSparsePreset } from '../generated/agent_start/runtime/v1/repo_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RepoSparsePresetValue } from './repo-types.js'

export function sparsePreset(value: RepoSparsePreset): RepoSparsePresetValue {
  return {
    id: required(value.id, 'Sparse preset ID'),
    repoId: required(value.repoId, 'Sparse preset repository ID'),
    name: required(value.name, 'Sparse preset name'),
    directories: [...value.directories],
    createdAt: integer(value.createdAt, 'Sparse preset creation timestamp'),
    updatedAt: integer(value.updatedAt, 'Sparse preset update timestamp')
  }
}

function required(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function integer(value: bigint, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw invalidResponse(`${label} is outside the safe integer range`)
  }
  return number
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

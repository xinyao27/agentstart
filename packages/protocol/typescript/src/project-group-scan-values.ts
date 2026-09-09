import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import type { ProjectGroupServiceScanNestedResponse } from '../generated/yiru/runtime/v1/project_group_pb.js'
import { RuntimeProtocolError } from './error.js'

export type NestedRepoCandidateValue = {
  path: string
  displayName: string
  depth: number
}

export type NestedRepoScanResultValue = {
  selectedPath: string
  selectedPathKind: 'git_repo' | 'non_git_folder'
  repos: NestedRepoCandidateValue[]
  truncated: boolean
  timedOut: boolean
  stopped: boolean
  durationMs: number
  maxDepth: number
  maxRepos: number
  timeoutMs: number | null
}

export function nestedScanResult(
  value: ProjectGroupServiceScanNestedResponse
): NestedRepoScanResultValue {
  return {
    selectedPath: value.selectedPath,
    selectedPathKind: scanPathKind(value.selectedPathKind),
    repos: value.repos.map((candidate) => ({
      path: candidate.path,
      displayName: candidate.displayName,
      depth: candidate.depth
    })),
    truncated: value.truncated,
    timedOut: value.timedOut,
    stopped: value.stopped,
    durationMs: epochMs(value.durationMs),
    maxDepth: value.maxDepth,
    maxRepos: value.maxRepos,
    timeoutMs: value.timeoutMs === undefined ? null : epochMs(value.timeoutMs)
  }
}

function scanPathKind(value: string): NestedRepoScanResultValue['selectedPathKind'] {
  if (value === 'git_repo' || value === 'non_git_folder') {
    return value
  }
  throw invalidResponse('Nested repo scan selected-path kind is unknown')
}

function epochMs(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw invalidResponse('Timestamp is outside the safe integer range')
  }
  return number
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

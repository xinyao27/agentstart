import type {
  RepoServiceBaseRefDefaultResponse,
  RepoServiceSearchRefsResponse
} from '../generated/yiru/runtime/v1/repo_pb.js'

export const REPO_REFS_PROTOCOL_CAPABILITY = 'repo.refs.protobuf.v1' as const

// Why: a repoId can collide across execution hosts within a local store (host
// OS vs a WSL distro); a paired environment's own store has no "disambiguate by
// hostId" concept, so hostId is local-only.
export type RepoBaseRefDefaultInput = { repo: string; hostId?: string }
export type RepoBaseRefDefaultResult = { defaultBaseRef: string | null; remoteCount: number }

export type RepoSearchRefsInput = { repo: string; query: string; limit?: number; hostId?: string }
export type RepoRefDetailValue = { localBranchName: string; refName: string }
export type RepoSearchRefsResult = {
  refs: string[]
  truncated: boolean
  // Why: presence-tracked. A folder project omits the detail list entirely
  // while a Git project with no matching refs sends an empty one, and the
  // legacy JSON surface distinguished the two via `refDetails` being absent.
  refDetails?: RepoRefDetailValue[]
}

export function baseRefDefault(value: RepoServiceBaseRefDefaultResponse): RepoBaseRefDefaultResult {
  return { defaultBaseRef: value.defaultBaseRef ?? null, remoteCount: value.remoteCount }
}

export function searchRefs(value: RepoServiceSearchRefsResponse): RepoSearchRefsResult {
  return {
    refs: [...value.refs],
    truncated: value.truncated,
    ...(value.refDetails
      ? {
          refDetails: value.refDetails.values.map((detail) => ({
            localBranchName: detail.localBranchName,
            refName: detail.refName
          }))
        }
      : {})
  }
}

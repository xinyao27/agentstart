import type { BaseRefSearchResult } from '@agentstart/protocol/git/worktree-source'
import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'

import { legacyBaseRefSearchResult } from '../new-workspace/base-ref-result'
import { requireRepoRefsProtocolClient } from './repo-catalog-target'
import { isRuntimeRepoRefSearchQueryWithinLimit } from './repo-search-bounds'
import { getActiveRuntimeTarget } from './rpc-client'

export type RuntimeRepoBaseRefDefault = {
  defaultBaseRef: string | null
  remoteCount: number
}

export async function getRuntimeRepoBaseRefDefault(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string,
  hostId?: ExecutionHostId
): Promise<RuntimeRepoBaseRefDefault> {
  const target = getActiveRuntimeTarget(settings)
  const client = await requireRepoRefsProtocolClient(target)
  // Why: a repoId can collide across execution hosts within a local store
  // (host OS vs a WSL distro); a paired environment's own store has no
  // "disambiguate by hostId" concept, so hostId is local-only.
  return client.baseRefDefault(
    { repo: repoId, ...(target.kind === 'local' && hostId ? { hostId } : {}) },
    { timeoutMs: 15_000 }
  )
}

export async function searchRuntimeRepoBaseRefs(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string,
  query: string,
  limit: number,
  hostId?: ExecutionHostId
): Promise<string[]> {
  if (!isRuntimeRepoRefSearchQueryWithinLimit(query)) {
    return []
  }
  const target = getActiveRuntimeTarget(settings)
  const client = await requireRepoRefsProtocolClient(target)
  const result = await client.searchRefs(
    { repo: repoId, query, limit, ...(target.kind === 'local' && hostId ? { hostId } : {}) },
    { timeoutMs: 15_000 }
  )
  return result.refs
}

export async function searchRuntimeRepoBaseRefDetails(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string,
  query: string,
  limit: number,
  hostId?: ExecutionHostId
): Promise<BaseRefSearchResult[]> {
  if (!isRuntimeRepoRefSearchQueryWithinLimit(query)) {
    return []
  }
  const target = getActiveRuntimeTarget(settings)
  const client = await requireRepoRefsProtocolClient(target)
  const result = await client.searchRefs(
    { repo: repoId, query, limit, ...(target.kind === 'local' && hostId ? { hostId } : {}) },
    { timeoutMs: 15_000 }
  )
  return result.refDetails ?? result.refs.map(legacyBaseRefSearchResult)
}

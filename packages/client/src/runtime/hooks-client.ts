import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { AgentStartHooks } from '@agentstart/protocol/worktree/hooks'
import { setupImportCandidate } from '~renderer/setup/import-candidate'
import type { SetupScriptImportCandidate } from '~renderer/setup/import-candidate'

import { requireRepoProtocolClient } from './repo-catalog-target'
import { getActiveRuntimeTarget } from './rpc-client'

export type HookCheckResult = {
  status?: 'ok' | 'error'
  hasHooks: boolean
  hooks: AgentStartHooks | null
  mayNeedUpdate: boolean
}

export async function checkRuntimeHooks(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string,
  hostId?: ExecutionHostId
): Promise<HookCheckResult> {
  const target = getActiveRuntimeTarget(settings)
  // Why: hostId disambiguates repoId collisions inside a single store. A
  // `local` target is this desktop's own store, which can hold repo records
  // for other hosts too, so hostId is meaningful there. An `environment`
  // target is a *different* runtime's own store, which has no concept of
  // other hosts from its own point of view — forwarding hostId there could
  // filter out that environment's own local repos.
  const result = await (
    await requireRepoProtocolClient(target)
  ).hooksCheck(
    {
      repo: repoId,
      ...(target.kind === 'local' && hostId ? { hostId } : {})
    },
    { timeoutMs: 15_000 }
  )
  return {
    status: result.status,
    hasHooks: result.hasHooks,
    hooks: result.hooks,
    mayNeedUpdate: result.mayNeedUpdate
  }
}

export async function inspectRuntimeSetupScriptImports(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string
): Promise<SetupScriptImportCandidate[]> {
  const target = getActiveRuntimeTarget(settings)
  const candidates = await (
    await requireRepoProtocolClient(target)
  ).setupScriptImports({ repo: repoId }, { timeoutMs: 15_000 })
  return candidates.map(setupImportCandidate)
}

import { getRepoExecutionHostId, parseExecutionHostId } from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import { isFolderRepo } from '@agentstart/protocol/project/repository'
import type { AgentStartHooks } from '@agentstart/protocol/worktree/hooks'
import { useEffect, useRef, useState } from 'react'
import { getRepoHostIdentity } from '~renderer/repo/state/host-identity'
import { checkRuntimeHooks } from '~renderer/runtime/hooks-client'

export type ProjectHooksState = {
  hasHooks: boolean
  hooks: AgentStartHooks | null
  mayNeedUpdate: boolean
}

export function useProjectHooks(repos: readonly Repo[], neededRepos: readonly Repo[]) {
  const [hooksByRepoHost, setHooksByRepoHost] = useState<Record<string, ProjectHooksState>>({})
  const requestSequenceRef = useRef(0)

  useEffect(() => {
    if (neededRepos.length === 0) {
      return
    }

    let isStale = false
    const requestSequence = ++requestSequenceRef.current
    const liveRepoHosts = new Set(repos.map(getRepoHostIdentity))

    void Promise.all(
      neededRepos.map(async (repo) => {
        const repoHostIdentity = getRepoHostIdentity(repo)
        if (isFolderRepo(repo)) {
          setHooksByRepoHost((previous) =>
            previous[repoHostIdentity]
              ? previous
              : {
                  ...previous,
                  [repoHostIdentity]: { hasHooks: false, hooks: null, mayNeedUpdate: false }
                }
          )
          return
        }
        try {
          const hostId = getRepoExecutionHostId(repo)
          const parsedHost = parseExecutionHostId(hostId)
          const result = await checkRuntimeHooks(
            {
              activeRuntimeEnvironmentId:
                parsedHost?.kind === 'runtime' ? parsedHost.environmentId : null
            },
            repo.id,
            hostId
          )
          if (isStale || requestSequence !== requestSequenceRef.current) {
            return
          }
          setHooksByRepoHost((previous) =>
            liveRepoHosts.has(repoHostIdentity)
              ? { ...previous, [repoHostIdentity]: result }
              : previous
          )
        } catch {
          if (isStale || requestSequence !== requestSequenceRef.current) {
            return
          }
          setHooksByRepoHost((previous) => {
            if (!liveRepoHosts.has(repoHostIdentity) || previous[repoHostIdentity]) {
              return previous
            }
            return {
              ...previous,
              [repoHostIdentity]: { hasHooks: false, hooks: null, mayNeedUpdate: false }
            }
          })
        }
      })
    )

    return () => {
      isStale = true
    }
  }, [neededRepos, repos])

  const liveRepoHosts = new Set(repos.map(getRepoHostIdentity))
  return Object.fromEntries(
    Object.entries(hooksByRepoHost).filter(([identity]) => liveRepoHosts.has(identity))
  ) as Record<string, ProjectHooksState>
}

import type { ClientEventsSubscriptionEventValue } from '@yiru/protocol'

import { requireClientEventsClient } from './client-events-target'
import { onLocalHostProgressEvent } from './host-progress-stream'
import { addRuntimeRepo, listRuntimeRepos, requireRepoProtocolClient } from './repo-catalog-target'
import { shellClient } from './shell-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'
import type { RepoWorkspaceApi } from './workspace-host-api'

const LOCAL_TARGET = { kind: 'local' } as const

const localClientEvents = createRuntimeStreamFanOut<
  Awaited<ReturnType<typeof requireClientEventsClient>>,
  ClientEventsSubscriptionEventValue
>({
  resolveClient: async () => requireClientEventsClient(LOCAL_TARGET),
  open: (client, signal) => client.subscribe({ signal }).then((stream) => stream.events)
})

const localRepoClient: RepoWorkspaceApi = {
  pickFolder: () => shellClient.repoHost.pickFolder(),
  pickFolders: () => shellClient.repoHost.pickFolders(),
  pickDirectory: () => shellClient.repoHost.pickDirectory(),
  removeForHost: (args) => shellClient.repoHost.removeForHost(args),
  reorderForHost: (args) => shellClient.repoHost.reorderForHost(args),
  cloneAbort: () => shellClient.repoHost.cloneAbort(),
  getDefaultCreateProjectParent: () => shellClient.repoHost.getDefaultCreateProjectParent(),
  list: async () => (await listRuntimeRepos(LOCAL_TARGET)).repos,
  add: async ({ expectedRevision, path, kind }) => {
    try {
      return await addRuntimeRepo(LOCAL_TARGET, {
        expectedRevision,
        path,
        kind
      })
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  create: async ({ expectedRevision, parentPath, name, kind }) =>
    (await requireRepoProtocolClient(LOCAL_TARGET)).create({
      expectedRevision,
      parentPath,
      name,
      kind
    }),
  clone: async ({ expectedRevision, url, destination }) =>
    (await requireRepoProtocolClient(LOCAL_TARGET)).clone(
      { expectedRevision, url, destination },
      { timeoutMs: 10 * 60_000 }
    ),
  isGitAvailable: async () => (await requireRepoProtocolClient(LOCAL_TARGET)).gitAvailable(),
  remove: async ({ expectedRevision, repoId }) =>
    (await requireRepoProtocolClient(LOCAL_TARGET)).rm({ expectedRevision, repo: repoId }),
  update: async ({ expectedRevision, repoId, updates }) =>
    (await requireRepoProtocolClient(LOCAL_TARGET)).update({
      expectedRevision,
      repo: repoId,
      updates
    }),
  onCloneProgress: (callback) =>
    onLocalHostProgressEvent('repoCloneProgress', ({ phase, percent }) =>
      callback({ phase, percent })
    ),
  onChanged: (callback) =>
    localClientEvents.subscribe((event: ClientEventsSubscriptionEventValue) => {
      if (event.type === 'reposChanged') {
        callback()
      }
    })
}

export const repoHostClient: RepoWorkspaceApi = localRepoClient

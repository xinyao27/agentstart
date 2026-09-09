import { runtimeEnvironmentTransport, UpdaterClient } from '@yiru/protocol'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'

export type UpdaterTarget = { kind: 'local' } | { kind: 'environment'; environmentId: string }

export async function openUpdaterTarget(target: UpdaterTarget): Promise<UpdaterClient> {
  const transport = await openConfiguredBrowserHostProtocol()
  switch (target.kind) {
    case 'local':
      return new UpdaterClient(transport)
    case 'environment':
      return new UpdaterClient(runtimeEnvironmentTransport(transport, target.environmentId))
  }
}

export async function openLocalUpdaterTarget(): Promise<UpdaterClient> {
  return openUpdaterTarget({ kind: 'local' })
}

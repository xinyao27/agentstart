import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  refreshProjectCatalogLineage,
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees
} from '~renderer/project-catalog/refresh'
import { describeRuntimeCompatBlock } from '~renderer/runtime/compatibility-message'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { runtimeEnvironmentsClient } from '~renderer/runtime/runtime-environments-client'

import {
  createRuntimeEnvironmentErrorDetails,
  getRuntimeEnvironmentErrorMessage,
  setRuntimeEnvironmentStatus
} from './runtime-environment-action-model'
import { evaluateHostDetails } from './runtime-environment-status'
import type { RuntimeEnvironmentList } from './use-runtime-environment-list'

type RuntimeEnvironmentConnectionOptions = Pick<
  RuntimeEnvironmentList,
  'mountedRef' | 'setDetailsByEnvironmentId'
> & {
  environment: PublicKnownRuntimeEnvironment
  queryClient: QueryClient
  setError: React.Dispatch<React.SetStateAction<string | null>>
}

export async function connectRuntimeEnvironment(
  options: RuntimeEnvironmentConnectionOptions
): Promise<boolean> {
  const { environment, mountedRef, queryClient } = options
  try {
    if (environment.pairingRequired) {
      throw new Error(translate('runtimeEnvironment.pairingRequired', 'Re-pairing required'))
    }
    const runtimeStatus = await runtimeEnvironmentsClient.getStatus({
      selector: environment.id,
      timeoutMs: 15_000
    })

    const compatibility = evaluateHostDetails(runtimeStatus)
    setRuntimeEnvironmentStatus(environment.id, runtimeStatus)
    if (mountedRef.current) {
      options.setDetailsByEnvironmentId((current) => ({
        ...current,
        [environment.id]: { status: 'ready', runtimeStatus, compatibility, error: null }
      }))
    }
    if (compatibility.kind === 'blocked') {
      const message = describeRuntimeCompatBlock(compatibility)
      if (mountedRef.current) {
        options.setError(message)
        toast.error(message)
      }
      return false
    }
    const target = { kind: 'environment', environmentId: environment.id } as const
    const repos = await refreshProjectCatalogTargetRepos(queryClient, target)
    await Promise.all([
      refreshProjectCatalogLineage(queryClient, target),
      ...repos.map((repo) => refreshProjectCatalogWorktrees(queryClient, repo))
    ])
    if (mountedRef.current) {
      toast.success(
        translate(
          'auto.components.settings.RuntimeEnvironmentsPane.runtimeReachable',
          '{{value0}} is reachable.',
          { value0: environment.name }
        )
      )
    }
    return true
  } catch (error) {
    setRuntimeEnvironmentStatus(environment.id, null)
    if (mountedRef.current) {
      const message = getRuntimeEnvironmentErrorMessage(
        error,
        translate(
          'auto.components.settings.RuntimeEnvironmentsPane.hostConnectFailed',
          'Failed to connect host.'
        )
      )
      options.setDetailsByEnvironmentId((current) => ({
        ...current,
        [environment.id]: createRuntimeEnvironmentErrorDetails(message)
      }))
      options.setError(message)
      toast.error(message)
    }
    return false
  }
}

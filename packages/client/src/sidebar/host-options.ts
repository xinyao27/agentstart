import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId,
  type ExecutionHostKind
} from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import type { RuntimeCompatVerdict } from '@yiru/protocol/runtime-compatibility'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { WorkspaceHostScope } from '@yiru/protocol/settings/ui-state'
import {
  buildExecutionHostRegistry,
  type ExecutionHostHealth
} from '~renderer/execution-host-registry'
import { translate } from '~renderer/i18n/i18n'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import type { RuntimeStatus } from '~renderer/runtime/status/model'

export type SidebarHostOption = {
  id: ExecutionHostId
  label: string
  detail: string
  kind: ExecutionHostKind
  health: ExecutionHostHealth
  presence: 'local' | 'configured' | 'project' | 'active'
  // Why: surfaced to the sidebar host-header menu so it can warn on version skew.
  compatibility?: RuntimeCompatVerdict
}

export type SidebarHostScopeOption = {
  id: WorkspaceHostScope
  label: string
  detail: string
  health: ExecutionHostHealth | 'mixed'
}

export function buildSidebarHostOptions(args: {
  repos: readonly Pick<Repo, 'connectionId' | 'executionHostId'>[]
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  // Why: live per-environment runtime status lets the registry surface compat
  // verdicts and blocked health in the sidebar without re-probing servers.
  runtimeStatusByEnvironmentId?: ReadonlyMap<
    string,
    { status?: RuntimeStatus | null; appVersion?: string | null }
  >
  runtimeEnvironments?: readonly Pick<PublicKnownRuntimeEnvironment, 'id' | 'name'>[]
  // Why: per-host display-label overrides rename hosts everywhere the sidebar
  // options feed (host headers, scope picker, focus menu).
  hostLabelOverrides?: ReadonlyMap<ExecutionHostId, string>
}): SidebarHostOption[] {
  const activeRuntimeHostId = args.settings?.activeRuntimeEnvironmentId?.trim()
    ? (`runtime:${encodeURIComponent(args.settings.activeRuntimeEnvironmentId.trim())}` as const)
    : null
  return buildExecutionHostRegistry({
    repos: args.repos,
    settings: args.settings,
    runtimeEnvironments: args.runtimeEnvironments,
    runtimeStatusByEnvironmentId: args.runtimeStatusByEnvironmentId,
    hostLabelOverrides: args.hostLabelOverrides
  }).map((host) => {
    if (host.kind === 'local') {
      return { ...host, presence: 'local' }
    }
    return {
      ...host,
      presence: host.id === activeRuntimeHostId ? 'active' : 'project'
    }
  })
}

export function shouldShowHostScopeControls(hosts: readonly SidebarHostOption[]): boolean {
  return hosts.some((host) => host.id !== LOCAL_EXECUTION_HOST_ID)
}

export function buildSidebarHostScopeOptions(
  hosts: readonly SidebarHostOption[]
): SidebarHostScopeOption[] {
  return [
    {
      id: ALL_EXECUTION_HOSTS_SCOPE,
      label: translate('auto.components.sidebar.sidebarHostOptions.3e102f111c', 'All hosts'),
      detail: hosts.map((host) => host.label).join(', '),
      health: 'mixed'
    },
    ...hosts.map((host) => ({
      id: host.id,
      label: host.label,
      detail: host.detail,
      health: host.health
    }))
  ]
}

export function getSidebarHostVisibilityLabel(
  visibleHostIds: readonly ExecutionHostId[] | null | undefined,
  hosts: readonly SidebarHostOption[]
): string {
  if (!visibleHostIds || visibleHostIds.length === hosts.length) {
    return translate('auto.components.sidebar.sidebarHostOptions.3e102f111c', 'All hosts')
  }
  if (visibleHostIds.length === 1) {
    return hosts.find((host) => host.id === visibleHostIds[0])?.label ?? 'Hosts'
  }
  return translate(
    'auto.components.sidebar.sidebarHostOptions.visibleHostsCount',
    '{{value0}} hosts',
    { value0: visibleHostIds.length }
  )
}

export function getSidebarHostHealthLabel(health: SidebarHostScopeOption['health']): string {
  switch (health) {
    case 'local':
      return 'Local'
    case 'available':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'blocked':
      return 'Update needed'
    case 'disconnected':
      return 'Disconnected'
    case 'error':
      return 'Needs attention'
    case 'mixed':
      return 'Mixed'
  }
}

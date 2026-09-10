import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { getLocalExecutionHostLabel } from '~renderer/execution-host/labels'
import { translate } from '~renderer/i18n/i18n'

export type ProviderAccountScope = {
  label: string
  description: string
}

export type ProviderRateLimitScope = {
  label: string
  description: string
}

export function getProviderAccountScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): ProviderAccountScope {
  const runtimeId = settings?.activeRuntimeEnvironmentId?.trim()
  if (runtimeId) {
    return {
      label: translate(
        'auto.components.settings.providerAccountScope.remoteServer',
        'Remote daemon: {{value0}}',
        { value0: runtimeId }
      ),
      description: translate(
        'auto.components.settings.providerAccountScope.remoteServerCredentials',
        'Credentials and account checks for this provider are owned by this remote daemon. Use Settings > Remote daemons > Advanced to edit another default runtime scope.'
      )
    }
  }
  return {
    label: getLocalExecutionHostLabel(),
    description: translate(
      'auto.components.settings.providerAccountScope.localCredentials',
      'Credentials and account checks for this provider are owned by this local daemon. Use Settings > Remote daemons > Advanced to edit daemon-owned credentials.'
    )
  }
}

export function getProviderRateLimitScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  providerLabel: string
): ProviderRateLimitScope {
  const runtimeId = settings?.activeRuntimeEnvironmentId?.trim()
  if (runtimeId) {
    return {
      label: translate(
        'auto.components.settings.providerAccountScope.remoteServer',
        'Remote daemon: {{value0}}',
        { value0: runtimeId }
      ),
      description: translate(
        'auto.components.settings.providerAccountScope.remoteServerRateLimit',
        '{{value0}} API budget is fetched from the CLI on this remote daemon. Use Settings > Remote daemons > Advanced to view another default runtime budget.',
        { value0: providerLabel }
      )
    }
  }
  return {
    label: getLocalExecutionHostLabel(),
    description: translate(
      'auto.components.settings.providerAccountScope.localRateLimit',
      '{{value0}} API budget is fetched from the CLI on this local daemon. Use Settings > Remote daemons > Advanced to view daemon-owned budgets.',
      { value0: providerLabel }
    )
  }
}

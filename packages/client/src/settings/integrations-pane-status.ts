import type { PreflightStatusValue as PreflightStatus } from '@yiru/protocol'

export type GhStatus = 'checking' | 'connected' | 'not-installed' | 'not-authenticated'
export type PreflightRefreshProvider = 'gh'

export type PreflightIntegrationStatuses = {
  ghStatus: GhStatus
}

function ghStatusFromPreflight(status: PreflightStatus['gh']): GhStatus {
  if (!status.installed) {
    return 'not-installed'
  }
  return status.authenticated ? 'connected' : 'not-authenticated'
}

export function getPreflightIntegrationStatuses(
  preflightStatus: PreflightStatus | null,
  refreshingProviders: ReadonlySet<PreflightRefreshProvider>
): PreflightIntegrationStatuses {
  if (!preflightStatus || refreshingProviders.has('gh')) {
    return { ghStatus: 'checking' }
  }
  return { ghStatus: ghStatusFromPreflight(preflightStatus.gh) }
}

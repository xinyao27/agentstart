import { parseExecutionHostId, type ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { HostSettingOverrides } from '@agentstart/protocol/settings/workspace-preferences'
import { getHostSettingOverride, setHostSettingOverride } from '~renderer/host-setting-overrides'

type OverridesSlice = Pick<GlobalSettings, 'hostSettingOverrides'>
type OverridesMap = Partial<Record<ExecutionHostId, HostSettingOverrides>>

/** The current user-chosen display-label override for a host, or undefined when
 *  the host still uses its derived label. */
export function getHostDisplayLabelOverride(
  settings: OverridesSlice | null | undefined,
  hostId: ExecutionHostId
): string | undefined {
  return getHostSettingOverride(settings, hostId, 'displayLabel')
}

/** Computes the next `hostSettingOverrides` after a rename. A blank label clears
 *  the override so the host reverts to its derived label. */
export function applyHostRename(
  settings: OverridesSlice | null | undefined,
  hostId: ExecutionHostId,
  nextLabel: string
): OverridesMap {
  return setHostSettingOverride(settings, hostId, 'displayLabel', nextLabel)
}

export type HostRemovalTarget = { kind: 'runtime'; environmentId: string } | null

/** Why: runtime environments deep-link into the Runtime Hosts pane because
 * their removal needs active-environment/error context that lives there. */
export function resolveHostRemoval(hostId: ExecutionHostId): HostRemovalTarget {
  const parsed = parseExecutionHostId(hostId)
  if (parsed?.kind === 'runtime') {
    return { kind: 'runtime', environmentId: parsed.environmentId }
  }
  return null
}

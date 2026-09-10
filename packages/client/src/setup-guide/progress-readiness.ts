import type { ComputerPermissionStatusResult } from '@agentstart/protocol'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

export type SetupScriptProbeState = {
  signature: string | null
  ready: boolean
  hasSetupScript: boolean
}

export type SetupGuideProgressReadinessInput = {
  refreshEnabled: boolean
  settingsLoaded: boolean
  preflightStatusChecked: boolean
  browserUseSkillDiscoveryLoading: boolean
  computerUseSkillDiscoveryLoading: boolean
  orchestrationSkillDiscoveryLoading: boolean
  setupScriptProbeReady: boolean
  computerUseSkillInstalled: boolean
  computerUsePermissionStatusChecked: boolean
}

export const INITIAL_SETUP_SCRIPT_PROBE_STATE: SetupScriptProbeState = {
  signature: null,
  ready: false,
  hasSetupScript: false
}

export function getSetupScriptProbeSignature(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  orderedGitRepos: readonly Pick<Repo, 'id' | 'hookSettings'>[]
): string | null {
  if (!settings) {
    return null
  }
  const target = getActiveRuntimeTarget(settings)
  return JSON.stringify({
    runtime: target.kind === 'environment' ? target.environmentId : 'local',
    repos: orderedGitRepos.map((repo) => ({
      id: repo.id,
      commandSourcePolicy: repo.hookSettings?.commandSourcePolicy ?? null,
      setup: repo.hookSettings?.scripts?.setup ?? null
    }))
  })
}

export function getCurrentSetupScriptProbeState(
  current: SetupScriptProbeState,
  signature: string | null
): SetupScriptProbeState {
  if (current.signature === signature) {
    return current
  }
  return { signature, ready: false, hasSetupScript: false }
}

export function getSetupGuideProgressReady(input: SetupGuideProgressReadinessInput): boolean {
  return (
    input.refreshEnabled &&
    input.settingsLoaded &&
    input.preflightStatusChecked &&
    !input.browserUseSkillDiscoveryLoading &&
    !input.computerUseSkillDiscoveryLoading &&
    !input.orchestrationSkillDiscoveryLoading &&
    input.setupScriptProbeReady &&
    (!input.computerUseSkillInstalled || input.computerUsePermissionStatusChecked)
  )
}

export function getComputerUsePermissionSetupState(status: ComputerPermissionStatusResult | null): {
  ready: boolean
  unavailable: boolean
} {
  return {
    ready:
      status !== null &&
      status.helperUnavailableReason === null &&
      status.permissions.every((permission) => permission.status !== 'not-granted'),
    unavailable: status !== null && status.helperUnavailableReason !== null
  }
}

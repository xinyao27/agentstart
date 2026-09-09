import {
  PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY,
  PROJECT_CONTEXT_PROTOCOL_CAPABILITY
} from '@yiru/protocol'
import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import type { ProjectHostSetup, ProjectHostSetupState } from '@yiru/protocol/project/model'
import type { ExecutionHostRegistryEntry } from '~renderer/execution-host-registry'
import { getExecutionHostLabel } from '~renderer/execution-host/labels'
import { translate } from '~renderer/i18n/i18n'

export type SetupHostOption = {
  id: ExecutionHostId
  label: string
  detail: string
  isAvailable: boolean
  canUsePathActions: boolean
}

export function getSetupStateLabel(setupState: ProjectHostSetupState): string {
  switch (setupState) {
    case 'ready':
      return translate('auto.components.settings.RepositoryPane.hostSetupStateReady', 'Ready')
    case 'not-set-up':
      return translate(
        'auto.components.settings.RepositoryPane.hostSetupStateNotSetUp',
        'Not set up'
      )
    case 'setting-up':
      return translate(
        'auto.components.settings.RepositoryPane.hostSetupStateSettingUp',
        'Setting up'
      )
    case 'error':
      return translate('auto.components.settings.RepositoryPane.hostSetupStateError', 'Error')
    case 'unsupported':
      return translate(
        'auto.components.settings.RepositoryPane.hostSetupStateUnsupported',
        'Unsupported'
      )
  }
}

export function buildSetupHostOptions({
  projectHostSetups,
  hostOptions
}: {
  projectHostSetups: ProjectHostSetup[]
  hostOptions: readonly ExecutionHostRegistryEntry[]
}): SetupHostOption[] {
  const setupHostIds = new Set(projectHostSetups.map((setup) => setup.hostId))
  return hostOptions
    .filter((host) => !setupHostIds.has(host.id))
    .map((host) => {
      const availability = getHostSetupAvailability(host)
      // Why: disconnected hosts remain useful as placeholders, but importing
      // or cloning requires a live execution host.
      const canUsePathActions = host.health === 'local' || host.health === 'available'
      return {
        id: host.id,
        label: host.label || getExecutionHostLabel(host.id),
        detail:
          availability.isAvailable && !canUsePathActions
            ? translate(
                'auto.components.settings.RepositoryPane.hostSetupConnectionRequired',
                'Connect this host before importing or cloning the project'
              )
            : availability.detail,
        isAvailable: availability.isAvailable,
        canUsePathActions
      }
    })
}

function getHostSetupAvailability(host: ExecutionHostRegistryEntry): {
  isAvailable: boolean
  detail: string
} {
  if (host.health === 'blocked') {
    return {
      isAvailable: false,
      detail: translate(
        'auto.components.settings.RepositoryPane.hostSetupBlockedVersion',
        'Runtime host version is incompatible'
      )
    }
  }
  if (host.kind === 'runtime') {
    const capabilities = host.capabilities
    if (!capabilities) {
      return {
        isAvailable: false,
        detail: translate(
          'auto.components.settings.RepositoryPane.hostSetupCheckingCapability',
          'Checking host capabilities'
        )
      }
    }
    if (
      !capabilities.includes(PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY) ||
      !capabilities.includes(PROJECT_CONTEXT_PROTOCOL_CAPABILITY)
    ) {
      return {
        isAvailable: false,
        detail: translate(
          'auto.components.settings.RepositoryPane.hostSetupMissingCapability',
          'Update Yiru on this host to set up projects'
        )
      }
    }
  }
  return {
    isAvailable: true,
    detail: host.detail
  }
}

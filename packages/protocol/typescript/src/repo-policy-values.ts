import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  RepoCommandSourcePolicy,
  RepoExternalWorktreeVisibility,
  RepoForgeRemotePreference,
  RepoForkSyncMode,
  type RepoHookSettings as ProtocolHookSettings,
  RepoHookSettingsMode,
  RepoProjectHostSetupMethod,
  RepoSetupAgentStartupPolicy,
  RepoSetupRunPolicy
} from '../generated/agent_start/runtime/v1/repo_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RepoHookSettingsValue, RepoValue } from './repo-types.js'

export function repoHookSettings(value: ProtocolHookSettings): RepoHookSettingsValue {
  const setupRunPolicy = runPolicy(value.setupRunPolicy)
  const setupAgentStartupPolicy = startupPolicy(value.setupAgentStartupPolicy)
  const commandSourcePolicy = commandPolicy(value.commandSourcePolicy)
  return {
    mode: hookMode(value.mode),
    ...(setupRunPolicy ? { setupRunPolicy } : {}),
    ...(setupAgentStartupPolicy ? { setupAgentStartupPolicy } : {}),
    ...(commandSourcePolicy ? { commandSourcePolicy } : {}),
    scripts: { setup: value.setupScript, archive: value.archiveScript }
  }
}

export function forgeRemotePreference(
  value: RepoForgeRemotePreference
): RepoValue['forgeRemotePreference'] {
  switch (value) {
    case RepoForgeRemotePreference.AUTO:
      return 'auto'
    case RepoForgeRemotePreference.UPSTREAM:
      return 'upstream'
    case RepoForgeRemotePreference.ORIGIN:
      return 'origin'
    case RepoForgeRemotePreference.UNSPECIFIED:
      return undefined
  }
  throw invalidResponse('Repository forge remote preference is unknown')
}

export function forkSyncMode(value: RepoForkSyncMode): RepoValue['forkSyncMode'] {
  switch (value) {
    case RepoForkSyncMode.ASK:
      return 'ask'
    case RepoForkSyncMode.SAFE_AUTO:
      return 'safe-auto'
    case RepoForkSyncMode.OFF:
      return 'off'
    case RepoForkSyncMode.UNSPECIFIED:
      return undefined
  }
  throw invalidResponse('Repository fork sync mode is unknown')
}

export function externalWorktreeVisibility(
  value: RepoExternalWorktreeVisibility
): RepoValue['externalWorktreeVisibility'] {
  switch (value) {
    case RepoExternalWorktreeVisibility.HIDE:
      return 'hide'
    case RepoExternalWorktreeVisibility.SHOW:
      return 'show'
    case RepoExternalWorktreeVisibility.UNSPECIFIED:
      return undefined
  }
  throw invalidResponse('Repository external worktree visibility is unknown')
}

export function projectHostSetupMethod(
  value: RepoProjectHostSetupMethod
): RepoValue['projectHostSetupMethod'] {
  switch (value) {
    case RepoProjectHostSetupMethod.IMPORTED_EXISTING_FOLDER:
      return 'imported-existing-folder'
    case RepoProjectHostSetupMethod.CLONED:
      return 'cloned'
    case RepoProjectHostSetupMethod.UNSPECIFIED:
      return undefined
  }
  throw invalidResponse('Repository host setup method is unknown')
}

function hookMode(value: RepoHookSettingsMode): 'auto' | 'override' {
  switch (value) {
    case RepoHookSettingsMode.AUTO:
      return 'auto'
    case RepoHookSettingsMode.OVERRIDE:
      return 'override'
    case RepoHookSettingsMode.UNSPECIFIED:
      throw invalidResponse('Repository hook mode is missing')
  }
  throw invalidResponse('Repository hook mode is unknown')
}

function runPolicy(value: RepoSetupRunPolicy): RepoHookSettingsValue['setupRunPolicy'] {
  switch (value) {
    case RepoSetupRunPolicy.ASK:
      return 'ask'
    case RepoSetupRunPolicy.RUN_BY_DEFAULT:
      return 'run-by-default'
    case RepoSetupRunPolicy.SKIP_BY_DEFAULT:
      return 'skip-by-default'
    case RepoSetupRunPolicy.UNSPECIFIED:
      return undefined
  }
  throw invalidResponse('Repository setup run policy is unknown')
}

function startupPolicy(
  value: RepoSetupAgentStartupPolicy
): RepoHookSettingsValue['setupAgentStartupPolicy'] {
  switch (value) {
    case RepoSetupAgentStartupPolicy.START_IMMEDIATELY:
      return 'start-immediately'
    case RepoSetupAgentStartupPolicy.WAIT_FOR_SETUP:
      return 'wait-for-setup'
    case RepoSetupAgentStartupPolicy.UNSPECIFIED:
      return undefined
  }
  throw invalidResponse('Repository setup startup policy is unknown')
}

function commandPolicy(
  value: RepoCommandSourcePolicy
): RepoHookSettingsValue['commandSourcePolicy'] {
  switch (value) {
    case RepoCommandSourcePolicy.SHARED_ONLY:
      return 'shared-only'
    case RepoCommandSourcePolicy.LOCAL_ONLY:
      return 'local-only'
    case RepoCommandSourcePolicy.RUN_BOTH:
      return 'run-both'
    case RepoCommandSourcePolicy.UNSPECIFIED:
      return undefined
  }
  throw invalidResponse('Repository command source policy is unknown')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

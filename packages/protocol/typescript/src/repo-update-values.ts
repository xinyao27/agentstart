import { create } from '@bufbuild/protobuf'

import {
  RepoCommandSourcePolicy,
  RepoExternalWorktreeVisibility,
  RepoForgeRemotePreference,
  RepoForkSyncMode,
  RepoIconImageSource,
  RepoIconSchema,
  RepoKind,
  RepoHookSettingsMode,
  RepoSetupAgentStartupPolicy,
  RepoSetupRunPolicy,
  RepoHookSettingsSchema,
  RepoNullableDoubleSchema,
  RepoNullableIconSchema,
  RepoNullableUpstreamSchema,
  RepoUpdateFieldsSchema,
  type RepoHookSettings,
  type RepoNullableDouble,
  type RepoNullableIcon,
  type RepoNullableUpstream,
  type RepoUpdateFields
} from '../generated/yiru/runtime/v1/repo_pb.js'
import type { RepoIconValue, RepoUpdateInput, RepoValue } from './repo-types.js'
import { nullableSourceControlAiInit, nullableStringInit } from './repo-update-ai-values.js'

// Why: every field maps into the presence-tracked `RepoUpdateFields` oneofs so
// "not sent", "cleared", and "set to a value" stay distinguishable on the wire,
// matching the legacy JSON surface's partial-update semantics field for field.
export function repoUpdateFields(input: RepoUpdateInput): RepoUpdateFields {
  return create(RepoUpdateFieldsSchema, {
    ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
    ...(input.badgeColor === undefined ? {} : { badgeColor: input.badgeColor }),
    ...(input.repoIcon === undefined ? {} : { repoIcon: nullableIconInit(input.repoIcon) }),
    ...(input.upstream === undefined ? {} : { upstream: nullableUpstreamInit(input.upstream) }),
    ...(input.hookSettings === undefined
      ? {}
      : { hookSettings: hookSettingsInit(input.hookSettings) }),
    ...(input.worktreeBaseRef === undefined ? {} : { worktreeBaseRef: input.worktreeBaseRef }),
    ...(input.worktreeBasePath === undefined ? {} : { worktreeBasePath: input.worktreeBasePath }),
    ...(input.kind === undefined
      ? {}
      : { kind: input.kind === 'git' ? RepoKind.GIT : RepoKind.FOLDER }),
    ...(input.symlinkPaths === undefined
      ? {}
      : { symlinkPaths: { values: [...input.symlinkPaths] } }),
    ...(input.forgeRemotePreference === undefined
      ? {}
      : { forgeRemotePreference: forge(input.forgeRemotePreference) }),
    ...(input.forkSyncMode === undefined ? {} : { forkSyncMode: sync(input.forkSyncMode) }),
    ...(input.externalWorktreeVisibility === undefined
      ? {}
      : { externalWorktreeVisibility: visibility(input.externalWorktreeVisibility) }),
    ...(input.externalWorktreeVisibilityPromptDismissedAt === undefined
      ? {}
      : {
          externalWorktreeVisibilityPromptDismissedAt:
            input.externalWorktreeVisibilityPromptDismissedAt
        }),
    ...(input.externalWorktreeInboxBaselinePaths === undefined
      ? {}
      : {
          externalWorktreeInboxBaselinePaths: {
            values: [...input.externalWorktreeInboxBaselinePaths]
          }
        }),
    ...(input.importedExternalWorktreePaths === undefined
      ? {}
      : { importedExternalWorktreePaths: { values: [...input.importedExternalWorktreePaths] } }),
    ...(input.externalWorktreeDiscoverySuppressedAt === undefined
      ? {}
      : {
          externalWorktreeDiscoverySuppressedAt: nullableDoubleInit(
            input.externalWorktreeDiscoverySuppressedAt
          )
        }),
    ...(input.projectGroupId === undefined
      ? {}
      : { projectGroupId: nullableStringInit(input.projectGroupId) }),
    ...(input.projectGroupOrder === undefined
      ? {}
      : { projectGroupOrder: input.projectGroupOrder }),
    ...(input.sourceControlAi === undefined
      ? {}
      : { sourceControlAi: nullableSourceControlAiInit(input.sourceControlAi) })
  })
}

function nullableIconInit(value: RepoIconValue | null): RepoNullableIcon {
  if (value === null) {
    return create(RepoNullableIconSchema, { value: { case: 'null', value: true } })
  }
  const icon = (() => {
    switch (value.type) {
      case 'lucide':
        return create(RepoIconSchema, { value: { case: 'lucideName', value: value.name } })
      case 'emoji':
        return create(RepoIconSchema, { value: { case: 'emoji', value: value.emoji } })
      case 'image':
        return create(RepoIconSchema, {
          value: {
            case: 'image',
            value: {
              src: value.src,
              source: imageSource(value.source),
              ...(value.label === undefined ? {} : { label: value.label })
            }
          }
        })
    }
  })()
  return create(RepoNullableIconSchema, { value: { case: 'icon', value: icon } })
}

function imageSource(value: 'upload' | 'file' | 'favicon' | 'github'): RepoIconImageSource {
  switch (value) {
    case 'upload':
      return RepoIconImageSource.UPLOAD
    case 'file':
      return RepoIconImageSource.FILE
    case 'favicon':
      return RepoIconImageSource.FAVICON
    case 'github':
      return RepoIconImageSource.GITHUB
  }
}

function nullableUpstreamInit(value: { owner: string; repo: string } | null): RepoNullableUpstream {
  return create(RepoNullableUpstreamSchema, {
    value:
      value === null
        ? { case: 'null', value: true }
        : { case: 'upstream', value: { owner: value.owner, repo: value.repo } }
  })
}

function nullableDoubleInit(value: number | null): RepoNullableDouble {
  return create(RepoNullableDoubleSchema, {
    value: value === null ? { case: 'null', value: true } : { case: 'number', value }
  })
}

function hookSettingsInit(value: NonNullable<RepoValue['hookSettings']>): RepoHookSettings {
  return create(RepoHookSettingsSchema, {
    mode: value.mode === 'auto' ? RepoHookSettingsMode.AUTO : RepoHookSettingsMode.OVERRIDE,
    setupRunPolicy: runPolicy(value.setupRunPolicy),
    setupAgentStartupPolicy: startupPolicy(value.setupAgentStartupPolicy),
    commandSourcePolicy: commandPolicy(value.commandSourcePolicy),
    setupScript: value.scripts.setup,
    archiveScript: value.scripts.archive
  })
}

function forge(value: 'auto' | 'upstream' | 'origin'): RepoForgeRemotePreference {
  switch (value) {
    case 'auto':
      return RepoForgeRemotePreference.AUTO
    case 'upstream':
      return RepoForgeRemotePreference.UPSTREAM
    case 'origin':
      return RepoForgeRemotePreference.ORIGIN
  }
}

function sync(value: 'ask' | 'safe-auto' | 'off'): RepoForkSyncMode {
  switch (value) {
    case 'ask':
      return RepoForkSyncMode.ASK
    case 'safe-auto':
      return RepoForkSyncMode.SAFE_AUTO
    case 'off':
      return RepoForkSyncMode.OFF
  }
}

function visibility(value: 'hide' | 'show'): RepoExternalWorktreeVisibility {
  return value === 'hide'
    ? RepoExternalWorktreeVisibility.HIDE
    : RepoExternalWorktreeVisibility.SHOW
}

function runPolicy(value: RepoSetupRunPolicyName): RepoSetupRunPolicy {
  switch (value) {
    case undefined:
      return RepoSetupRunPolicy.UNSPECIFIED
    case 'ask':
      return RepoSetupRunPolicy.ASK
    case 'run-by-default':
      return RepoSetupRunPolicy.RUN_BY_DEFAULT
    case 'skip-by-default':
      return RepoSetupRunPolicy.SKIP_BY_DEFAULT
  }
}

function startupPolicy(value: RepoSetupAgentStartupPolicyName): RepoSetupAgentStartupPolicy {
  switch (value) {
    case undefined:
      return RepoSetupAgentStartupPolicy.UNSPECIFIED
    case 'start-immediately':
      return RepoSetupAgentStartupPolicy.START_IMMEDIATELY
    case 'wait-for-setup':
      return RepoSetupAgentStartupPolicy.WAIT_FOR_SETUP
  }
}

function commandPolicy(value: RepoCommandSourcePolicyName): RepoCommandSourcePolicy {
  switch (value) {
    case undefined:
      return RepoCommandSourcePolicy.UNSPECIFIED
    case 'shared-only':
      return RepoCommandSourcePolicy.SHARED_ONLY
    case 'local-only':
      return RepoCommandSourcePolicy.LOCAL_ONLY
    case 'run-both':
      return RepoCommandSourcePolicy.RUN_BOTH
  }
}

type RepoSetupRunPolicyName = NonNullable<RepoValue['hookSettings']>['setupRunPolicy']
type RepoSetupAgentStartupPolicyName = NonNullable<
  RepoValue['hookSettings']
>['setupAgentStartupPolicy']
type RepoCommandSourcePolicyName = NonNullable<RepoValue['hookSettings']>['commandSourcePolicy']

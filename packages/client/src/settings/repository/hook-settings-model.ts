import type { RepoHookSettingsValue as RepoHookSettings } from '@agentstart/protocol'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { HookCommandSourcePolicy, SetupRunPolicy } from '@agentstart/protocol/worktree/hooks'
import { translate } from '~renderer/i18n/i18n'

import { DEFAULT_REPO_HOOK_SETTINGS } from '../constants'

export type PolicyOption<P> = { policy: P; label: string; description: string }
export type LocalHookName = 'setup' | 'archive'
export type HookSettingsPolicyDraft = Partial<
  Pick<RepoHookSettings, 'setupRunPolicy' | 'setupAgentStartupPolicy' | 'commandSourcePolicy'>
>
export type LocalHookField = {
  name: LocalHookName
  label: string
  description: string
  placeholder: string
}
export type LocalCommandSourcePolicyNotice =
  | { kind: 'checking' }
  | { kind: 'action'; policy: 'local-only' | 'run-both'; label: string }

export const EXAMPLE_TEMPLATE = `scripts:
  setup: |
    pnpm worktree:setup
  archive: |
    echo "Cleaning up before archive"`

export const YAML_STATE_STYLES: Record<string, { card: string; titleClassName: string }> = {
  loaded: {
    card: 'border-emerald-500/20 bg-emerald-500/5',
    titleClassName: 'text-emerald-700 dark:text-emerald-300'
  },
  'update-available': {
    card: 'border-amber-500/20 bg-amber-500/5',
    titleClassName: 'text-amber-700 dark:text-amber-300'
  },
  invalid: {
    card: 'border-amber-500/20 bg-amber-500/5',
    titleClassName: 'text-amber-700 dark:text-amber-300'
  },
  missing: { card: 'border-border/50 bg-muted/20', titleClassName: 'text-foreground' }
}

export function getHookSettingsDraft(hookSettings: Repo['hookSettings']): RepoHookSettings {
  return {
    ...DEFAULT_REPO_HOOK_SETTINGS,
    ...hookSettings,
    scripts: { ...DEFAULT_REPO_HOOK_SETTINGS.scripts, ...hookSettings?.scripts }
  }
}

export function areHookSettingsDraftsEqual(a: RepoHookSettings, b: RepoHookSettings): boolean {
  return (
    a.mode === b.mode &&
    a.setupRunPolicy === b.setupRunPolicy &&
    a.setupAgentStartupPolicy === b.setupAgentStartupPolicy &&
    a.commandSourcePolicy === b.commandSourcePolicy &&
    a.scripts.setup === b.scripts.setup &&
    a.scripts.archive === b.scripts.archive
  )
}

export function getLocalCommandSourcePolicyNotice({
  hooksInspectionReady,
  currentPolicy,
  setupScript,
  archiveScript,
  hasSharedScript
}: {
  hooksInspectionReady: boolean
  currentPolicy: HookCommandSourcePolicy
  setupScript: string | undefined
  archiveScript: string | undefined
  hasSharedScript: boolean
}): LocalCommandSourcePolicyNotice | null {
  if ((!setupScript?.trim() && !archiveScript?.trim()) || currentPolicy !== 'shared-only') {
    return null
  }
  if (!hooksInspectionReady) {
    return { kind: 'checking' }
  }
  return hasSharedScript
    ? {
        kind: 'action',
        policy: 'run-both',
        label: translate('auto.components.settings.RepositoryHooksSection.8d6c56bff8', 'Run both')
      }
    : {
        kind: 'action',
        policy: 'local-only',
        label: translate(
          'auto.components.settings.RepositoryHooksSection.8bfe65fc60',
          'Use local commands'
        )
      }
}

export function getSetupRunPolicyOptions(): PolicyOption<SetupRunPolicy>[] {
  return [
    {
      policy: 'ask',
      label: translate(
        'auto.components.settings.RepositoryHooksSection.e03d9a8f38',
        'Ask every time'
      ),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.90b1f50137',
        'Prompt before running setup.'
      )
    },
    {
      policy: 'run-by-default',
      label: translate(
        'auto.components.settings.RepositoryHooksSection.d3ef1ab247',
        'Run by default'
      ),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.022ba10cf2',
        'Run setup automatically.'
      )
    },
    {
      policy: 'skip-by-default',
      label: translate(
        'auto.components.settings.RepositoryHooksSection.15debc1fd9',
        'Skip by default'
      ),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.99e3264a49',
        'Only run setup when chosen.'
      )
    }
  ]
}

export function getCommandSourcePolicyOptions(): PolicyOption<HookCommandSourcePolicy>[] {
  return [
    {
      policy: 'shared-only',
      label: translate(
        'auto.components.settings.RepositoryHooksSection.d88b6ff88f',
        'agentstart.yaml only'
      ),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.29397e8bbc',
        'Run only committed repo commands; ignore local commands.'
      )
    },
    {
      policy: 'local-only',
      label: translate('auto.components.settings.RepositoryHooksSection.83dc78202a', 'Local only'),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.0e8b2a520d',
        'Ignore agentstart.yaml; run only your local commands.'
      )
    },
    {
      policy: 'run-both',
      label: translate('auto.components.settings.RepositoryHooksSection.8d6c56bff8', 'Run both'),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.8561b0665f',
        'agentstart.yaml first, then your local commands.'
      )
    }
  ]
}

export function getCommandSourceLabel(policy: HookCommandSourcePolicy): string {
  switch (policy) {
    case 'shared-only':
      return translate(
        'auto.components.settings.RepositoryHooksSection.d88b6ff88f',
        'agentstart.yaml only'
      )
    case 'local-only':
      return translate('auto.components.settings.RepositoryHooksSection.83dc78202a', 'Local only')
    case 'run-both':
      return translate('auto.components.settings.RepositoryHooksSection.8d6c56bff8', 'Run both')
  }
}

export function getLocalHookFields(): readonly [LocalHookField, LocalHookField] {
  return [
    {
      name: 'setup',
      label: translate(
        'auto.components.settings.RepositoryHooksSection.52b31baf02',
        'Setup Script'
      ),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.f0710e1c83',
        'Runs after a new worktree is created; install deps, copy env files, run migrations.'
      ),
      placeholder: translate(
        'auto.components.settings.RepositoryHooksSection.a3fc966677',
        '# e.g. pnpm install cp "$AGENTSTART_ROOT_PATH/.env" "$AGENTSTART_WORKTREE_PATH/.env"'
      )
    },
    {
      name: 'archive',
      label: translate(
        'auto.components.settings.RepositoryHooksSection.9a100323ff',
        'Archive Script'
      ),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.6f90ebe3fd',
        'Runs before a worktree is archived or removed.'
      ),
      placeholder: translate(
        'auto.components.settings.RepositoryHooksSection.9b821fa19d',
        '# e.g. echo "Cleaning up $AGENTSTART_WORKSPACE_NAME"'
      )
    }
  ]
}

export function getEnvVars(): readonly { name: string; description: string }[] {
  return [
    {
      name: '$AGENTSTART_ROOT_PATH',
      description: translate(
        'auto.components.settings.RepositoryHooksSection.30952c4aa4',
        'Path to the main repo checkout. Useful for copying shared files, like .env, into a worktree.'
      )
    },
    {
      name: '$AGENTSTART_WORKTREE_PATH',
      description: translate(
        'auto.components.settings.RepositoryHooksSection.54c73d88d0',
        'Path to the worktree being created. Setup commands run from this directory.'
      )
    },
    {
      name: '$AGENTSTART_WORKSPACE_NAME',
      description: translate(
        'auto.components.settings.RepositoryHooksSection.0fa21e19ec',
        'Name of the workspace, usually based on the branch name.'
      )
    }
  ]
}

export function getYamlStateCopy(yamlState: string): { heading: string; description: string } {
  switch (yamlState) {
    case 'loaded':
      return {
        heading: translate(
          'auto.components.settings.RepositoryHooksSection.56f9a4a1d0',
          'Using `agentstart.yaml`'
        ),
        description: translate(
          'auto.components.settings.RepositoryHooksSection.ca424ff135',
          'Shared setup and archive hooks are defined in the repo and available to everyone who uses it.'
        )
      }
    case 'update-available':
      return {
        heading: translate(
          'auto.components.settings.RepositoryHooksSection.623e0c9f31',
          '`agentstart.yaml` could not be parsed'
        ),
        description: translate(
          'auto.components.settings.RepositoryHooksSection.aba825233f',
          'The file contains configuration keys that this version of AgentStart does not recognize. You may need to update AgentStart, or check the file for typos.'
        )
      }
    case 'invalid':
      return {
        heading: translate(
          'auto.components.settings.RepositoryHooksSection.623e0c9f31',
          '`agentstart.yaml` could not be parsed'
        ),
        description: translate(
          'auto.components.settings.RepositoryHooksSection.0cc712b823',
          'The core configuration file exists in the repo root, but AgentStart could not parse the supported hook definitions yet.'
        )
      }
    default:
      return {
        heading: translate(
          'auto.components.settings.RepositoryHooksSection.5a67e4793d',
          'No `agentstart.yaml` detected'
        ),
        description: translate(
          'auto.components.settings.RepositoryHooksSection.b20c5df6ca',
          'Add a `agentstart.yaml` file to enable shared setup and archive hooks for this repo. Example template:'
        )
      }
  }
}

export function getParseErrorFixes(): readonly string[] {
  return [
    translate(
      'auto.components.settings.RepositoryHooksSection.07ba35bc68',
      'Check the indentation under `scripts:`. Hook keys should use two spaces, and command lines should use four.'
    ),
    translate(
      'auto.components.settings.RepositoryHooksSection.787ca433ef',
      'Define only the supported keys: `scripts`, `setup`, and `archive`.'
    ),
    translate(
      'auto.components.settings.RepositoryHooksSection.ecc73d9125',
      'Compare your file against the working template below and copy that shape if needed.'
    )
  ]
}

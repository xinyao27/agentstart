import type { RepoHookSettingsValue as RepoHookSettings } from '@agentstart/protocol'
import { getRepoExecutionHostId } from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import { resolveHookCommandSourcePolicy } from '@agentstart/protocol/setup/command-source-policy'
import type {
  HookCommandSourcePolicy,
  SetupAgentStartupPolicy,
  SetupRunPolicy
} from '@agentstart/protocol/worktree/hooks'
import type { AgentStartHooks } from '@agentstart/protocol/worktree/hooks'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { useAppStore } from '~renderer/store/state'

import { SettingsSwitch } from '../form-controls'
import { matchesSettingsSearch } from '../search'
import { SearchableSetting } from '../searchable-setting'
import { LocalCommandSourceNotice, SegmentedPolicyToggle } from './hook-policy-controls'
import { ScriptEditor } from './hook-script-editor'
import {
  getCommandSourcePolicyOptions,
  getLocalCommandSourcePolicyNotice,
  getLocalHookFields,
  getParseErrorFixes,
  getSetupRunPolicyOptions,
  getYamlStateCopy
} from './hook-settings-model'
import { RepositoryHooksAdvancedSection } from './hooks-advanced-section'
import { getRepositoryLocalCommandsSectionId } from './settings-targets'
import { useRepositoryHookSettingsDraft } from './use-hook-settings-draft'

type RepositoryHooksSectionProps = {
  repo: Repo
  yamlHooks: AgentStartHooks | null
  hasHooksFile: boolean
  hooksInspectionReady: boolean
  mayNeedUpdate: boolean
  copiedTemplate: boolean
  forceVisible?: boolean
  onCopyTemplate: () => void
  onUpdateHookSettings: (settings: RepoHookSettings) => void
}

export function RepositoryHooksSection({
  repo,
  yamlHooks,
  hasHooksFile,
  hooksInspectionReady,
  mayNeedUpdate,
  copiedTemplate,
  forceVisible = false,
  onCopyTemplate,
  onUpdateHookSettings
}: RepositoryHooksSectionProps): React.JSX.Element {
  // Why: this component uses the lightweight translate() helper; subscribe here
  // so render-time option/copy builders refresh when the UI language changes.
  useUiLocale()
  const settingsSearchQuery = useAppStore((s) => s.settingsSearchQuery)
  const selectedHostId = getRepoExecutionHostId(repo)
  const repoHostIdentity = `${selectedHostId}\0${repo.id}`
  const yamlState = yamlHooks
    ? 'loaded'
    : hasHooksFile
      ? mayNeedUpdate
        ? 'update-available'
        : 'invalid'
      : 'missing'

  const {
    hookSettingsDraft,
    updateScriptDraft,
    commitScriptDraft,
    flushScriptDraftOnUnmount,
    updateHookSettingsPolicyDraft
  } = useRepositoryHookSettingsDraft({ repo, repoHostIdentity, onUpdateHookSettings })
  const selectedSetupRunPolicy: SetupRunPolicy =
    hookSettingsDraft.setupRunPolicy ?? 'run-by-default'
  const selectedSetupAgentStartupPolicy: SetupAgentStartupPolicy =
    hookSettingsDraft.setupAgentStartupPolicy ?? 'start-immediately'
  const setupRunPolicyOptions = getSetupRunPolicyOptions()
  const commandSourcePolicyOptions = getCommandSourcePolicyOptions()
  const localHookFields = getLocalHookFields()
  const yamlStateCopy = getYamlStateCopy(yamlState)
  const parseErrorFixes = getParseErrorFixes()

  const sharedSetupScript = yamlHooks?.scripts.setup
  const sharedArchiveScript = yamlHooks?.scripts.archive
  const hasSharedSetupScript = Boolean(sharedSetupScript?.trim())
  const hasSharedArchiveScript = Boolean(sharedArchiveScript?.trim())
  const hasSharedScript = Boolean(sharedSetupScript?.trim() || sharedArchiveScript?.trim())
  const hasLocalScript = Boolean(
    hookSettingsDraft.scripts.setup?.trim() || hookSettingsDraft.scripts.archive?.trim()
  )
  const selectedCommandSourcePolicy: HookCommandSourcePolicy = resolveHookCommandSourcePolicy(
    hookSettingsDraft.commandSourcePolicy,
    { hasLocalScript }
  )
  const localCommandSourceNotice = getLocalCommandSourcePolicyNotice({
    hooksInspectionReady,
    currentPolicy: selectedCommandSourcePolicy,
    setupScript: hookSettingsDraft.scripts.setup,
    archiveScript: hookSettingsDraft.scripts.archive,
    hasSharedScript
  })
  const advancedMatchesSearch =
    settingsSearchQuery.trim() !== '' &&
    matchesSettingsSearch(settingsSearchQuery, {
      title: translate('auto.components.settings.RepositoryHooksSection.c9bc1bfd8f', 'Advanced'),
      description: translate(
        'auto.components.settings.RepositoryHooksSection.610d90fdbd',
        'Command source and agentstart.yaml details.'
      ),
      keywords: [
        translate('auto.components.settings.RepositoryHooksSection.c5a55a2d2e', 'advanced'),
        translate('auto.components.settings.RepositoryHooksSection.4611b78617', 'command source'),
        translate('auto.components.settings.RepositoryHooksSection.39da2ae12f', 'agentstart.yaml'),
        translate('auto.components.settings.RepositoryHooksSection.d2b3016c20', 'shared'),
        translate('auto.components.settings.RepositoryHooksSection.2d03a514db', 'local'),
        translate('auto.components.settings.RepositoryHooksSection.0518758f38', 'both'),
        translate('auto.components.settings.RepositoryHooksSection.fac13f8c1e', 'authoritative')
      ]
    })
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  return (
    <section ref={flushScriptDraftOnUnmount} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">
          {translate(
            'auto.components.settings.RepositoryHooksSection.ff082fe7c6',
            'Worktree Hooks'
          )}
        </h2>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.RepositoryHooksSection.8567127a40',
            'Scripts that run when worktrees are created or archived. Local scripts are stored on this machine; `agentstart.yaml` scripts are shared with your team.'
          )}
        </p>
      </div>

      <SearchableSetting
        title={translate(
          'auto.components.settings.RepositoryHooksSection.52b31baf02',
          'Setup Script'
        )}
        description={translate(
          'auto.components.settings.RepositoryHooksSection.30d555acd2',
          'Local and shared scripts that run after a new worktree is created.'
        )}
        forceVisible={forceVisible}
        keywords={[
          'setup',
          'script',
          'command',
          'local',
          'local settings scripts',
          'agentstart.yaml',
          'agentstart.yaml hooks',
          'hook'
        ]}
      >
        <ScriptEditor
          key={`${repo.id}:setup`}
          field={localHookFields[0]}
          value={hookSettingsDraft.scripts.setup ?? ''}
          hasShared={hasSharedSetupScript}
          sharedScript={sharedSetupScript}
          onChange={(next) => updateScriptDraft('setup', next)}
          onCommit={commitScriptDraft}
          sectionId={getRepositoryLocalCommandsSectionId(repo.id)}
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate(
          'auto.components.settings.RepositoryHooksSection.fb6bebcf7e',
          'When to Run Setup'
        )}
        description={translate(
          'auto.components.settings.RepositoryHooksSection.63e1783173',
          'Choose the default behavior when a setup script is available.'
        )}
        forceVisible={forceVisible}
        keywords={['setup run policy', 'ask', 'run by default', 'skip by default']}
      >
        <div className="border-border/50 bg-background/80 space-y-4 rounded-2xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h5 className="text-sm font-semibold">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.793dcee97d',
                  'When to run'
                )}
              </h5>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.21fb607a87',
                  'Default behavior when a new worktree is created.'
                )}
              </p>
            </div>
            <SegmentedPolicyToggle
              options={setupRunPolicyOptions}
              selected={selectedSetupRunPolicy}
              onSelect={(policy) => updateHookSettingsPolicyDraft({ setupRunPolicy: policy })}
            />
          </div>
          <div className="border-border/60 flex items-start justify-between gap-4 border-t pt-4">
            <div className="min-w-0 space-y-1">
              <h5 className="text-sm font-semibold">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.waitForSetupBeforeAgent',
                  'Wait for setup to complete before starting agent'
                )}
              </h5>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.RepositoryHooksSection.waitForSetupBeforeAgentHelp',
                  'Turn this on when setup installs dependencies, MCP servers, or config files the agent needs during startup.'
                )}
              </p>
            </div>
            <SettingsSwitch
              checked={selectedSetupAgentStartupPolicy === 'wait-for-setup'}
              onChange={() =>
                updateHookSettingsPolicyDraft({
                  setupAgentStartupPolicy:
                    selectedSetupAgentStartupPolicy === 'wait-for-setup'
                      ? 'start-immediately'
                      : 'wait-for-setup'
                })
              }
              ariaLabel={translate(
                'auto.components.settings.RepositoryHooksSection.waitForSetupBeforeAgent',
                'Wait for setup to complete before starting agent'
              )}
            />
          </div>
        </div>
      </SearchableSetting>

      <SearchableSetting
        title={translate(
          'auto.components.settings.RepositoryHooksSection.9a100323ff',
          'Archive Script'
        )}
        description={translate(
          'auto.components.settings.RepositoryHooksSection.b91a0f297d',
          'Local and shared scripts that run before a worktree is archived.'
        )}
        forceVisible={forceVisible}
        keywords={[
          'archive',
          'script',
          'command',
          'local',
          'local settings scripts',
          'agentstart.yaml',
          'agentstart.yaml hooks',
          'hook'
        ]}
      >
        <ScriptEditor
          key={`${repo.id}:archive`}
          field={localHookFields[1]}
          value={hookSettingsDraft.scripts.archive ?? ''}
          hasShared={hasSharedArchiveScript}
          sharedScript={sharedArchiveScript}
          onChange={(next) => updateScriptDraft('archive', next)}
          onCommit={commitScriptDraft}
        />
      </SearchableSetting>

      {localCommandSourceNotice ? (
        <LocalCommandSourceNotice
          notice={localCommandSourceNotice}
          onSelectPolicy={(policy) =>
            updateHookSettingsPolicyDraft({ commandSourcePolicy: policy })
          }
        />
      ) : null}

      <RepositoryHooksAdvancedSection
        forceVisible={forceVisible}
        advancedMatchesSearch={advancedMatchesSearch}
        isAdvancedOpen={isAdvancedOpen}
        onAdvancedOpenChange={setIsAdvancedOpen}
        selectedCommandSourcePolicy={selectedCommandSourcePolicy}
        commandSourcePolicyOptions={commandSourcePolicyOptions}
        onSelectPolicy={(policy) => updateHookSettingsPolicyDraft({ commandSourcePolicy: policy })}
        yamlState={yamlState}
        yamlStateCopy={yamlStateCopy}
        yamlHooks={yamlHooks}
        parseErrorFixes={parseErrorFixes}
        copiedTemplate={copiedTemplate}
        onCopyTemplate={onCopyTemplate}
      />
    </section>
  )
}

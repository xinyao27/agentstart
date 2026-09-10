import { getBranchPrefixIssue } from '@agentstart/protocol/git/branch-prefix'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { SourceControlAiSettingsPatch } from '@agentstart/protocol/source-control/ai-types'
import { DEFAULT_SOURCE_CONTROL_GROUP_ORDER } from '@agentstart/protocol/source-control/group-order'
import type { SourceControlGroupOrder } from '@agentstart/protocol/source-control/group-order'
import { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Switch } from '~renderer/ui/switch'

import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { AutoRenameBranchFromWorkSetting } from './auto-rename-branch-from-work-setting'
import { getAutoRenameBranchSearchEntries } from './auto-rename-branch-search'
import { BranchPrefixFeedback } from './branch-prefix-feedback'
import {
  CompareAgainstUpstreamSetting,
  compareAgainstUpstreamMatchesSearch
} from './compare-against-upstream-setting'
import { SettingsRow, SettingsSegmentedControl } from './form-controls'
import {
  KEEP_LOCAL_MAIN_UP_TO_DATE_SECTION_ID,
  getKeepLocalMainUpToDateTitle
} from './keep-local-main-up-to-date-setting'
import { matchesSettingsSearch } from './search'
import { SearchableSetting } from './searchable-setting'

const KEEP_LOCAL_MAIN_UP_TO_DATE_DESCRIPTION =
  'When you create a workspace, AgentStart refreshes the remote base and safely fast-forwards your matching local branch, such as main or master. This keeps commands like git diff main...HEAD from comparing against stale history. AgentStart skips the update if that branch has uncommitted changes or local-only commits.'
const KEEP_LOCAL_MAIN_UP_TO_DATE_KEYWORDS = [
  'main',
  'master',
  'origin/main',
  'git diff',
  'behind main',
  'up to date',
  'stale main',
  'refresh local main',
  'base ref',
  'fresh base',
  'safely',
  'worktree'
]
const SOURCE_CONTROL_GROUP_ORDER_KEYWORDS = [
  'group order',
  'changes first',
  'staged first',
  'untracked first',
  'source control',
  'git changes'
]

function shouldShowAutoRenameBranchSetting(
  searchQuery: string,
  hasUnsavedBranchPromptChanges: boolean
): boolean {
  return (
    hasUnsavedBranchPromptChanges ||
    matchesSettingsSearch(searchQuery, getAutoRenameBranchSearchEntries())
  )
}

type GitPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  writeSourceControlAiSettings: (patch: SourceControlAiSettingsPatch) => Promise<void>
  displayedGitUsername: string
  hasUnsavedBranchPromptChanges?: boolean
  onBranchPromptDirtyChange?: (dirty: boolean) => void
  branchPromptDiscardSignal?: number
  settingsSearchQuery?: string
}

function SourceControlGroupOrderSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}): React.JSX.Element {
  const value = settings.sourceControlGroupOrder ?? DEFAULT_SOURCE_CONTROL_GROUP_ORDER
  const title = translate(
    'auto.components.settings.GitPane.sourceControlGroupOrderTitle',
    'Source Control Group Order'
  )
  const description = translate(
    'auto.components.settings.GitPane.sourceControlGroupOrderDescription',
    'Choose whether Changes, Staged Changes, or Untracked Files appear first in Source Control.'
  )

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={SOURCE_CONTROL_GROUP_ORDER_KEYWORDS}
      className="max-w-none"
    >
      <SettingsRow
        label={title}
        description={description}
        alignTop
        control={
          <SettingsSegmentedControl<SourceControlGroupOrder>
            value={value}
            onChange={(nextValue) => {
              if (nextValue !== value) {
                void updateSettings({ sourceControlGroupOrder: nextValue })
              }
            }}
            ariaLabel={title}
            size="sm"
            options={[
              {
                value: 'changes-first',
                label: translate('auto.components.settings.GitPane.changesFirst', 'Changes first')
              },
              {
                value: 'staged-first',
                label: translate('auto.components.settings.GitPane.stagedFirst', 'Staged first')
              },
              {
                value: 'untracked-first',
                label: translate(
                  'auto.components.settings.GitPane.untrackedFirst',
                  'Untracked first'
                )
              }
            ]}
          />
        }
      />
    </SearchableSetting>
  )
}

export function GitPane({
  settings,
  updateSettings,
  writeSourceControlAiSettings,
  displayedGitUsername,
  hasUnsavedBranchPromptChanges = false,
  onBranchPromptDirtyChange,
  branchPromptDiscardSignal,
  settingsSearchQuery
}: GitPaneProps): React.JSX.Element {
  const storeSearchQuery = useAppStore((s) => s.settingsSearchQuery)
  const searchQuery = settingsSearchQuery ?? storeSearchQuery
  const keepLocalMainUpToDateTitle = getKeepLocalMainUpToDateTitle()
  // Why: settings persistence can round-trip over SSH; a local draft prevents
  // delayed store echoes from moving the caret or overwriting fast input.
  const [customPrefixDraft, setCustomPrefixDraft] = useState(settings.branchPrefixCustom)
  const lastCommittedPrefixRef = useRef(settings.branchPrefixCustom)
  useEffect(() => {
    if (settings.branchPrefixCustom !== lastCommittedPrefixRef.current) {
      lastCommittedPrefixRef.current = settings.branchPrefixCustom
      setCustomPrefixDraft(settings.branchPrefixCustom)
    }
  }, [settings.branchPrefixCustom])
  const branchPrefixInputValue =
    settings.branchPrefix === 'git-username' ? displayedGitUsername : customPrefixDraft

  const visibleSections = [
    matchesSettingsSearch(searchQuery, {
      title: translate('auto.components.settings.GitPane.330f584b50', 'Branch Prefix'),
      description: translate(
        'auto.components.settings.GitPane.1ffaadf0a0',
        'Prefix added to branch names when creating worktrees.'
      ),
      keywords: [
        translate('auto.components.settings.GitPane.cc63fce906', 'branch naming'),
        translate('auto.components.settings.GitPane.2351aa5a31', 'git username'),
        translate('auto.components.settings.GitPane.813e15b346', 'custom')
      ]
    }) ? (
      <SearchableSetting
        key="branch-prefix"
        title={translate('auto.components.settings.GitPane.330f584b50', 'Branch Prefix')}
        description={translate(
          'auto.components.settings.GitPane.1ffaadf0a0',
          'Prefix added to branch names when creating worktrees.'
        )}
        keywords={['branch naming', 'git username', 'custom']}
        className="space-y-3"
      >
        <div className="space-y-0.5">
          <Label>{translate('auto.components.settings.GitPane.330f584b50', 'Branch Prefix')}</Label>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.GitPane.1ec5c91e1d',
              'Choose whether branch names use your Git username, a custom prefix, or no prefix.'
            )}
          </p>
        </div>
        <div className="border-border/50 flex w-fit gap-1 rounded-md border p-1">
          {(['git-username', 'custom', 'none'] as const).map((option) => (
            <Button
              variant="quiet"
              size="sm"
              key={option}
              onClick={() => updateSettings({ branchPrefix: option })}
              className={cn(
                'text-sm ',
                'py-1 ',
                settings.branchPrefix === option ? 'bg-accent text-accent-foreground' : ' '
              )}
            >
              {option === 'git-username'
                ? translate('auto.components.settings.GitPane.a182c5125e', 'Git Username')
                : option === 'custom'
                  ? translate('auto.components.settings.GitPane.1f32ba27a6', 'Custom')
                  : translate('auto.components.settings.GitPane.3d172725cc', 'None')}
            </Button>
          ))}
        </div>
        {(settings.branchPrefix === 'custom' || settings.branchPrefix === 'git-username') && (
          <Input
            value={branchPrefixInputValue}
            onChange={(e) => {
              const nextPrefix = e.target.value
              lastCommittedPrefixRef.current = nextPrefix
              setCustomPrefixDraft(nextPrefix)
              updateSettings({ branchPrefixCustom: nextPrefix })
            }}
            placeholder={
              settings.branchPrefix === 'git-username'
                ? translate(
                    'auto.components.settings.GitPane.aefa1ecb59',
                    'No git username configured'
                  )
                : translate('auto.components.settings.GitPane.b559bf9899', 'e.g. feature')
            }
            className="max-w-xs"
            readOnly={settings.branchPrefix === 'git-username'}
            aria-invalid={getBranchPrefixIssue(branchPrefixInputValue) !== null}
          />
        )}
        {(settings.branchPrefix === 'custom' || settings.branchPrefix === 'git-username') && (
          <BranchPrefixFeedback rawPrefix={branchPrefixInputValue} />
        )}
      </SearchableSetting>
    ) : null,
    matchesSettingsSearch(searchQuery, {
      title: keepLocalMainUpToDateTitle,
      description: KEEP_LOCAL_MAIN_UP_TO_DATE_DESCRIPTION,
      keywords: KEEP_LOCAL_MAIN_UP_TO_DATE_KEYWORDS
    }) ? (
      <SearchableSetting
        key="refresh-base-ref"
        id={KEEP_LOCAL_MAIN_UP_TO_DATE_SECTION_ID}
        title={keepLocalMainUpToDateTitle}
        description={KEEP_LOCAL_MAIN_UP_TO_DATE_DESCRIPTION}
        keywords={KEEP_LOCAL_MAIN_UP_TO_DATE_KEYWORDS}
        className="flex items-center justify-between gap-4 py-2"
      >
        <div className="space-y-0.5">
          <Label>{keepLocalMainUpToDateTitle}</Label>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.GitPane.976afc6b3e',
              'When you create a workspace, AgentStart refreshes the remote base and safely fast-forwards your matching local branch, such as'
            )}
            <code>{translate('auto.components.settings.GitPane.ffba483bae', 'main')}</code>{' '}
            {translate('auto.components.settings.GitPane.5bf885be48', 'or')}
            <code>{translate('auto.components.settings.GitPane.3ae3de8898', 'master')}</code>
            {translate('auto.components.settings.GitPane.db3a127eb1', '. This keeps commands like')}
            <code>
              {translate('auto.components.settings.GitPane.d072a12995', 'git diff main...HEAD')}
            </code>{' '}
            {translate(
              'auto.components.settings.GitPane.36e3de3619',
              'from comparing against stale history. AgentStart skips the update if that branch has uncommitted changes or local-only commits.'
            )}
          </p>
        </div>
        <Switch
          checked={settings.refreshLocalBaseRefOnWorktreeCreate}
          onCheckedChange={(checked) =>
            updateSettings({ refreshLocalBaseRefOnWorktreeCreate: checked })
          }
        />
      </SearchableSetting>
    ) : null,
    matchesSettingsSearch(searchQuery, {
      title: translate(
        'auto.components.settings.GitPane.sourceControlGroupOrderTitle',
        'Source Control Group Order'
      ),
      description: translate(
        'auto.components.settings.GitPane.sourceControlGroupOrderDescription',
        'Choose whether Changes, Staged Changes, or Untracked Files appear first in Source Control.'
      ),
      keywords: SOURCE_CONTROL_GROUP_ORDER_KEYWORDS
    }) ? (
      <SourceControlGroupOrderSetting
        key="source-control-group-order"
        settings={settings}
        updateSettings={updateSettings}
      />
    ) : null,
    compareAgainstUpstreamMatchesSearch(searchQuery) ? (
      <CompareAgainstUpstreamSetting
        key="compare-against-upstream"
        settings={settings}
        updateSettings={updateSettings}
      />
    ) : null,
    shouldShowAutoRenameBranchSetting(searchQuery, hasUnsavedBranchPromptChanges) ? (
      <AutoRenameBranchFromWorkSetting
        key="auto-rename-branch-from-work"
        settings={settings}
        updateSettings={updateSettings}
        writeSourceControlAiSettings={writeSourceControlAiSettings}
        forceVisible={hasUnsavedBranchPromptChanges}
        onBranchPromptDirtyChange={onBranchPromptDirtyChange}
        branchPromptDiscardSignal={branchPromptDiscardSignal}
        settingsSearchQuery={searchQuery}
      />
    ) : null,
    matchesSettingsSearch(searchQuery, {
      title: translate('auto.components.settings.GitPane.e02ea23a32', 'AgentStart Attribution'),
      description: translate(
        'auto.components.settings.GitPane.d2eede4c54',
        'Add AgentStart attribution to commits and PRs.'
      ),
      keywords: [
        translate('auto.components.settings.GitPane.32dca11189', 'github'),
        translate('auto.components.settings.GitPane.895d3f70b8', 'gh'),
        translate('auto.components.settings.GitPane.b4ef5428a7', 'pr'),
        translate('auto.components.settings.GitPane.9838c921ed', 'co-author'),
        translate('auto.components.settings.GitPane.b5f534717a', 'coauthored'),
        translate('auto.components.settings.GitPane.b9b5771bb1', 'attribution'),
        translate('auto.components.settings.GitPane.e71ce09c42', 'agentstart')
      ]
    }) ? (
      <SearchableSetting
        key="github-attribution"
        title={translate('auto.components.settings.GitPane.e02ea23a32', 'AgentStart Attribution')}
        description={translate(
          'auto.components.settings.GitPane.d2eede4c54',
          'Add AgentStart attribution to commits and PRs.'
        )}
        keywords={['github', 'gh', 'pr', 'co-author', 'coauthored', 'attribution', 'agentstart']}
        className="flex items-center justify-between gap-4 py-2"
      >
        <div className="space-y-0.5">
          <Label>
            {translate('auto.components.settings.GitPane.e02ea23a32', 'AgentStart Attribution')}
          </Label>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.GitPane.d2eede4c54',
              'Add AgentStart attribution to commits and PRs.'
            )}
          </p>
        </div>
        <Switch
          checked={settings.enableGitHubAttribution}
          onCheckedChange={(checked) => updateSettings({ enableGitHubAttribution: checked })}
        />
      </SearchableSetting>
    ) : null
  ].filter(Boolean)

  return <div className="space-y-4">{visibleSections}</div>
}

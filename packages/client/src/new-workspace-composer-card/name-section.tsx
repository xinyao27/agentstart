import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { ProjectSourceContext } from '@agentstart/protocol/project/source-context'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle } from '~renderer/icons/hugeicons'
import SmartWorkspaceNameField, {
  type SmartWorkspaceNameSelection
} from '~renderer/new-workspace/smart-workspace-name-field'
import type { SmartNameMode } from '~renderer/new-workspace/smart-workspace-source-results'
import { Checkbox } from '~renderer/ui/checkbox'
import { cn } from '~renderer/ui/class-names'

import type { RepoOption } from './card-types'

type NameSectionProps = {
  selectedRepoIsGit: boolean
  nameInputRef?: React.RefObject<HTMLInputElement | null>
  eligibleRepos: RepoOption[]
  repoId: string
  onRepoChange: (value: string) => void
  name: string
  onNameValueChange: (value: string) => void
  onSmartGitHubItemSelect: (item: GitHubWorkItem) => void
  onSmartBranchSelect: (refName: string, localBranchName: string) => void
  onSmartNameModeChange?: (mode: SmartNameMode) => void
  smartNameSelection: SmartWorkspaceNameSelection | null
  onClearSmartNameSelection: () => void
  smartNameGitHubSourceContext?: ProjectSourceContext | null
  branchesEnabled: boolean
  repoBackedSourcesDisabled?: boolean
  repoBackedSearchRepos?: RepoOption[]
  allowSmartNameAddProject?: boolean
  smartNameRepoSwitchTarget?: 'project' | 'project-source'
  forkPushWarning: string | null
  /** True when an existing local branch is selected and can be reused. */
  canReuseSelectedBranch: boolean
  reuseSelectedBranch: boolean
  onReuseSelectedBranchChange: (next: boolean) => void
  /** Enter on the name field advances focus to the next field (Agent combobox). */
  onPlainEnterAdvance: () => void
}

export function NameSection({
  selectedRepoIsGit,
  nameInputRef,
  eligibleRepos,
  repoId,
  onRepoChange,
  name,
  onNameValueChange,
  onSmartGitHubItemSelect,
  onSmartBranchSelect,
  onSmartNameModeChange,
  smartNameSelection,
  onClearSmartNameSelection,
  smartNameGitHubSourceContext,
  branchesEnabled,
  repoBackedSourcesDisabled = false,
  repoBackedSearchRepos,
  allowSmartNameAddProject = true,
  smartNameRepoSwitchTarget = 'project',
  forkPushWarning,
  canReuseSelectedBranch,
  reuseSelectedBranch,
  onReuseSelectedBranchChange,
  onPlainEnterAdvance
}: NameSectionProps): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1" data-contextual-tour-target="workspace-creation-name">
      <label className="text-muted-foreground block min-w-0 truncate text-xs font-medium">
        {selectedRepoIsGit
          ? translate(
              'auto.components.NewWorkspaceComposerCard.ac3748dcda',
              "Name or 'Create From'"
            )
          : translate('auto.components.NewWorkspaceComposerCard.0ee17638fe', 'Workspace name')}{' '}
        <span className="text-muted-foreground/70">
          {translate('auto.components.NewWorkspaceComposerCard.0c5d6a479c', '[Optional]')}
        </span>
      </label>
      <SmartWorkspaceNameField
        inputRef={nameInputRef}
        repos={eligibleRepos}
        repoId={repoId}
        onRepoChange={onRepoChange}
        value={name}
        onValueChange={onNameValueChange}
        onGitHubItemSelect={onSmartGitHubItemSelect}
        onBranchSelect={onSmartBranchSelect}
        selectedSource={smartNameSelection}
        onClearSelectedSource={onClearSmartNameSelection}
        githubSourceContext={smartNameGitHubSourceContext}
        textOnly={!selectedRepoIsGit}
        branchesEnabled={branchesEnabled}
        repoBackedSourcesDisabled={repoBackedSourcesDisabled}
        repoBackedSearchRepos={repoBackedSearchRepos}
        allowCrossRepoProjectAdd={allowSmartNameAddProject}
        crossRepoSwitchTarget={smartNameRepoSwitchTarget}
        onActiveSourceModeChange={onSmartNameModeChange}
        onPlainEnter={onPlainEnterAdvance}
      />
      {forkPushWarning ? (
        <p className="flex items-start gap-1.5 text-[11px] text-yellow-600 dark:text-yellow-500">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span>{forkPushWarning}</span>
        </p>
      ) : null}
      {/* Why (#5181): sits right under the branch selection (not the Name
          field, which can differ from the branch) so reusing the picked
          branch is an explicit, discoverable choice. Stays mounted and
          collapses via a grid-rows transition (matching the Advanced
          drawer) so the dialog grows/shrinks smoothly as the option
          appears. Only offered when reuse is possible — an existing local
          branch not already checked out in another worktree. */}
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          canReuseSelectedBranch ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        aria-hidden={!canReuseSelectedBranch}
      >
        <div className="min-h-0">
          <div className="space-y-1 pt-1">
            <label className="text-foreground flex w-fit items-center gap-2 text-xs">
              <Checkbox
                checked={reuseSelectedBranch}
                onCheckedChange={(checked) => onReuseSelectedBranchChange(checked === true)}
                // Why: while collapsed the row is aria-hidden, so disable the
                // input too — keeps a hidden control out of the tab order and
                // fully inert (no focusable control inside an aria-hidden tree).
                disabled={!canReuseSelectedBranch}
              />
              <span>
                {translate(
                  'auto.components.NewWorkspaceComposerCard.reuseExistingBranch',
                  'Reuse branch'
                )}
              </span>
            </label>
            <p className="text-muted-foreground pl-6 text-[11px]">
              {translate(
                'auto.components.NewWorkspaceComposerCard.reuseExistingBranchHint',
                'Check out the existing branch instead of creating a new one from it.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

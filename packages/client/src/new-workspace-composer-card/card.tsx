import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { GitHubWorkItem } from '@yiru/protocol/hosted-review/review-types'
import type { ProjectSourceContext } from '@yiru/protocol/project/source-context'
import type { SparsePreset } from '@yiru/protocol/worktree/create-result'
import type { SetupAgentStartupPolicy } from '@yiru/protocol/worktree/hooks'
import React from 'react'
import { useContextualTour } from '~renderer/contextual-tours/use-contextual-tour'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import type { NewWorkspaceProjectOption } from '~renderer/new-workspace-composer-card/new-workspace-project-options'
import type { ProjectHostSetupOption } from '~renderer/new-workspace-composer-card/project-host-setup-options'
import type { WorkspaceCreateErrorDisplay } from '~renderer/new-workspace-composer-card/workspace-create-error-format'
import type { SmartWorkspaceNameSelection } from '~renderer/new-workspace/smart-workspace-name-field'
import type { SmartNameMode } from '~renderer/new-workspace/smart-workspace-source-results'
import type { SetupConfig } from '~renderer/new-workspace/workspace-creation'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import { AdvancedSection } from './advanced-section'
import { AgentSection } from './agent-section'
import type { RepoOption } from './card-types'
import { useComposerFileDragOver } from './file-drag'
import { NameSection } from './name-section'
import { ProjectSection } from './project-section'
import { SubmitFooter } from './submit-footer'

const EMPTY_PROJECT_OPTIONS: NewWorkspaceProjectOption[] = []
const EMPTY_PROJECT_HOST_SETUP_OPTIONS: ProjectHostSetupOption[] = []

type NewWorkspaceComposerCardProps = {
  contextualTourSource?: string
  containerClassName?: string
  composerRef?: React.RefObject<HTMLDivElement | null>
  onComposerNodeChange?: (node: HTMLDivElement | null) => void
  nameInputRef?: React.RefObject<HTMLInputElement | null>
  quickAgent: TuiAgent | null
  onQuickAgentChange: (agent: TuiAgent | null) => void
  eligibleRepos: RepoOption[]
  repoId: string
  projectOptions?: NewWorkspaceProjectOption[]
  selectedProjectId?: string | null
  selectedRepoIsGit: boolean
  onRepoChange: (value: string) => void
  onProjectChange: (value: string) => void
  projectHostSetupOptions?: ProjectHostSetupOption[]
  selectedProjectHostSetupId?: string | null
  onProjectHostSetupChange?: (setupId: string) => void
  repoBackedSearchRepos?: RepoOption[]
  repoBackedSourcesDisabled?: boolean
  allowSmartNameAddProject?: boolean
  smartNameRepoSwitchTarget?: 'project' | 'project-source'
  primaryActionLabel: string
  projectLabel?: string
  projectPlaceholder?: string
  emptyProjectMessage?: string
  showAddProjectButton?: boolean
  name: string
  onNameValueChange: (value: string) => void
  branchNameOverride: string | undefined
  onBranchNameOverrideChange: (value: string | undefined) => void
  onSmartGitHubItemSelect: (item: GitHubWorkItem) => void
  onSmartBranchSelect: (refName: string, localBranchName: string) => void
  onSmartNameModeChange?: (mode: SmartNameMode) => void
  smartNameSelection: SmartWorkspaceNameSelection | null
  onClearSmartNameSelection: () => void
  /** True when an existing local branch is selected and can be reused. */
  canReuseSelectedBranch: boolean
  reuseSelectedBranch: boolean
  onReuseSelectedBranchChange: (next: boolean) => void
  /** Shows the footer "Create more" switch — worktree targets only. */
  showCreateMultiple?: boolean
  createMultiple?: boolean
  onCreateMultipleChange?: (next: boolean) => void
  smartNameGitHubSourceContext?: ProjectSourceContext | null
  /** Advisory shown under the name field when a fork PR can't accept maintainer pushes. */
  forkPushWarning: string | null
  detectedAgentIds: Set<TuiAgent> | null
  onOpenAgentSettings: () => void
  advancedOpen: boolean
  onToggleAdvanced: () => void
  createDisabled: boolean
  projectError: string | null
  creating: boolean
  onCreate: () => void
  note: string
  onNoteChange: (value: string) => void
  setupConfig: SetupConfig | null
  requiresExplicitSetupChoice: boolean
  setupDecision: 'run' | 'skip' | null
  onSetupDecisionChange: (value: 'run' | 'skip') => void
  setupAgentStartupPolicy: SetupAgentStartupPolicy
  onSetupAgentStartupPolicyChange: (value: SetupAgentStartupPolicy) => void
  shouldWaitForSetupCheck: boolean
  resolvedSetupDecision: 'run' | 'skip' | null
  createError: WorkspaceCreateErrorDisplay | null
  branchesEnabled?: boolean
  setupControlsEnabled?: boolean
  canUseSparseCheckout: boolean
  sparsePresets: SparsePreset[]
  sparseSelectedPresetId: string | null
  onSparseSelectPreset: (preset: SparsePreset | null) => void
  sparseControlsEnabled?: boolean
}

// Why: this component intentionally keeps the composer card's inline and modal
// variants sharing one UI surface, split across this folder's sub-components
// instead of one monolithic file so each concern (project, name, agent,
// advanced, footer) can be read and changed independently.
export function NewWorkspaceComposerCard({
  contextualTourSource,
  containerClassName,
  composerRef,
  onComposerNodeChange,
  nameInputRef,
  quickAgent,
  onQuickAgentChange,
  eligibleRepos,
  repoId,
  projectOptions = EMPTY_PROJECT_OPTIONS,
  selectedProjectId = null,
  selectedRepoIsGit,
  onRepoChange,
  onProjectChange,
  projectHostSetupOptions = EMPTY_PROJECT_HOST_SETUP_OPTIONS,
  selectedProjectHostSetupId = null,
  onProjectHostSetupChange,
  repoBackedSearchRepos,
  repoBackedSourcesDisabled = false,
  allowSmartNameAddProject = true,
  smartNameRepoSwitchTarget = 'project',
  primaryActionLabel,
  projectLabel,
  projectPlaceholder,
  emptyProjectMessage,
  showAddProjectButton = true,
  name,
  onNameValueChange,
  branchNameOverride,
  onBranchNameOverrideChange,
  onSmartGitHubItemSelect,
  onSmartBranchSelect,
  onSmartNameModeChange,
  smartNameSelection,
  onClearSmartNameSelection,
  canReuseSelectedBranch,
  reuseSelectedBranch,
  onReuseSelectedBranchChange,
  showCreateMultiple = false,
  createMultiple = false,
  onCreateMultipleChange,
  smartNameGitHubSourceContext,
  forkPushWarning,
  detectedAgentIds,
  onOpenAgentSettings,
  advancedOpen,
  onToggleAdvanced,
  createDisabled,
  projectError,
  creating,
  onCreate,
  note,
  onNoteChange,
  setupConfig,
  requiresExplicitSetupChoice,
  setupDecision,
  onSetupDecisionChange,
  setupAgentStartupPolicy,
  onSetupAgentStartupPolicyChange,
  shouldWaitForSetupCheck,
  resolvedSetupDecision,
  createError,
  branchesEnabled = true,
  setupControlsEnabled = true,
  canUseSparseCheckout,
  sparsePresets,
  sparseSelectedPresetId,
  onSparseSelectPreset,
  sparseControlsEnabled = true
}: NewWorkspaceComposerCardProps): React.JSX.Element {
  // Why: this form uses the lightweight translate() helper directly; subscribe
  // so an already-open create dialog repaints when the UI language changes.
  useUiLocale()
  const { isFileDragOver, dragHandlers } = useComposerFileDragOver()
  const activeModal = useAppStore((s) => s.activeModal)
  const nameInputFocusFrameRef = React.useRef<number | null>(null)

  const cancelNameInputFocusFrame = (): void => {
    if (nameInputFocusFrameRef.current === null) {
      return
    }
    cancelAnimationFrame(nameInputFocusFrameRef.current)
    nameInputFocusFrameRef.current = null
  }

  const setComposerNode = (node: HTMLDivElement | null): void => {
    // Why: the queued repo-picker focus is only valid while this composer exists.
    if (!node) {
      cancelNameInputFocusFrame()
    }
    if (composerRef) {
      composerRef.current = node
    }
    onComposerNodeChange?.(node)
  }

  const focusNameInput = () => {
    // Why: after the repo picker commits a choice, moving focus to the name
    // field keeps the keyboard flow progressing through the form instead of
    // trapping the user in the repo popover interaction.
    cancelNameInputFocusFrame()
    nameInputFocusFrameRef.current = requestAnimationFrame(() => {
      nameInputFocusFrameRef.current = null
      nameInputRef?.current?.focus()
    })
  }

  const handleNameEnterAdvance = (): void => {
    // Why: Enter on the workspace name advances focus to the next field
    // (Agent combobox) rather than submitting, letting the user progress
    // through the form with just the keyboard.
    const root = composerRef?.current
    const agentTrigger = root?.querySelector<HTMLElement>(
      '[data-agent-combobox-root="true"][role="combobox"]'
    )
    agentTrigger?.focus()
  }

  useContextualTour(
    'workspace-creation',
    projectOptions.length > 0 && Boolean(selectedProjectId),
    contextualTourSource ??
      (activeModal === 'new-workspace-composer'
        ? 'workspace_creation_modal'
        : 'workspace_creation_visible')
  )

  return (
    <div
      ref={setComposerNode}
      data-workspace-composer-root="true"
      // Why: the root marker routes drops anywhere on the card to the composer
      // attachment handler.
      onDragEnter={dragHandlers.onDragEnter}
      onDragLeave={dragHandlers.onDragLeave}
      className={cn(
        'grid min-w-0 gap-1 border border-transparent transition',
        isFileDragOver && 'border-ring',
        containerClassName
      )}
    >
      <div className="min-w-0 space-y-4 pt-3">
        <ProjectSection
          projectLabel={projectLabel}
          projectPlaceholder={projectPlaceholder}
          emptyProjectMessage={emptyProjectMessage}
          showAddProjectButton={showAddProjectButton}
          projectOptions={projectOptions}
          selectedProjectId={selectedProjectId}
          onProjectChange={onProjectChange}
          onProjectSelected={focusNameInput}
          projectError={projectError}
          projectHostSetupOptions={projectHostSetupOptions}
          selectedProjectHostSetupId={selectedProjectHostSetupId}
          onProjectHostSetupChange={onProjectHostSetupChange}
        />

        <NameSection
          selectedRepoIsGit={selectedRepoIsGit}
          nameInputRef={nameInputRef}
          eligibleRepos={eligibleRepos}
          repoId={repoId}
          onRepoChange={onRepoChange}
          name={name}
          onNameValueChange={onNameValueChange}
          onSmartGitHubItemSelect={onSmartGitHubItemSelect}
          onSmartBranchSelect={onSmartBranchSelect}
          onSmartNameModeChange={onSmartNameModeChange}
          smartNameSelection={smartNameSelection}
          onClearSmartNameSelection={onClearSmartNameSelection}
          smartNameGitHubSourceContext={smartNameGitHubSourceContext}
          branchesEnabled={branchesEnabled}
          repoBackedSourcesDisabled={repoBackedSourcesDisabled}
          repoBackedSearchRepos={repoBackedSearchRepos}
          allowSmartNameAddProject={allowSmartNameAddProject}
          smartNameRepoSwitchTarget={smartNameRepoSwitchTarget}
          forkPushWarning={forkPushWarning}
          canReuseSelectedBranch={canReuseSelectedBranch}
          reuseSelectedBranch={reuseSelectedBranch}
          onReuseSelectedBranchChange={onReuseSelectedBranchChange}
          onPlainEnterAdvance={handleNameEnterAdvance}
        />

        <AgentSection
          quickAgent={quickAgent}
          onQuickAgentChange={onQuickAgentChange}
          detectedAgentIds={detectedAgentIds}
          onOpenAgentSettings={onOpenAgentSettings}
          createDisabled={createDisabled}
          onCreate={onCreate}
        />

        <AdvancedSection
          advancedOpen={advancedOpen}
          onToggleAdvanced={onToggleAdvanced}
          smartNameSelection={smartNameSelection}
          name={name}
          onNameValueChange={onNameValueChange}
          selectedRepoIsGit={selectedRepoIsGit}
          branchesEnabled={branchesEnabled}
          branchNameOverride={branchNameOverride}
          onBranchNameOverrideChange={onBranchNameOverrideChange}
          note={note}
          onNoteChange={onNoteChange}
          setupControlsEnabled={setupControlsEnabled}
          setupConfig={setupConfig}
          requiresExplicitSetupChoice={requiresExplicitSetupChoice}
          setupDecision={setupDecision}
          onSetupDecisionChange={onSetupDecisionChange}
          setupAgentStartupPolicy={setupAgentStartupPolicy}
          onSetupAgentStartupPolicyChange={onSetupAgentStartupPolicyChange}
          shouldWaitForSetupCheck={shouldWaitForSetupCheck}
          resolvedSetupDecision={resolvedSetupDecision}
          sparseControlsEnabled={sparseControlsEnabled}
          repoId={repoId}
          sparsePresets={sparsePresets}
          sparseSelectedPresetId={sparseSelectedPresetId}
          onSparseSelectPreset={onSparseSelectPreset}
          canUseSparseCheckout={canUseSparseCheckout}
        />
      </div>

      <SubmitFooter
        createError={createError}
        showCreateMultiple={showCreateMultiple}
        createMultiple={createMultiple}
        onCreateMultipleChange={onCreateMultipleChange}
        primaryActionLabel={primaryActionLabel}
        creating={creating}
        createDisabled={createDisabled}
        onCreate={onCreate}
      />
    </div>
  )
}

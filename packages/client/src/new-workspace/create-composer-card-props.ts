import { getAttachmentLabel } from '~renderer/new-workspace/workspace-creation'

import type { ComposerCardProps } from './composer-contract'
import type { createComposerActions } from './create-composer-actions'
import type { useComposerForm } from './use-composer-form'

type CreateComposerCardPropsInput = {
  actions: ReturnType<typeof createComposerActions>
  createDisabled: boolean
  form: ReturnType<typeof useComposerForm>
  onOpenAgentSettings: () => void
  onSubmit: () => Promise<void>
}

export function createComposerCardProps({
  actions,
  createDisabled,
  form,
  onOpenAgentSettings,
  onSubmit
}: CreateComposerCardPropsInput): ComposerCardProps {
  const { agent, attachments, github, linkPicker, setup, source, sparse, target } = form
  const isFolderTarget = target.isProjectGroupTarget

  return {
    eligibleRepos: isFolderTarget ? target.folderSourceRepos : target.eligibleRepos,
    repoId: target.repoId,
    projectOptions: target.projectOptions,
    selectedProjectId: target.selectedProjectId,
    selectedRepoIsGit: isFolderTarget ? true : target.selectedRepoIsGit,
    onRepoChange: isFolderTarget ? actions.handleFolderSourceRepoChange : actions.handleRepoChange,
    onProjectChange: actions.handleProjectChange,
    projectHostSetupOptions: isFolderTarget ? [] : target.projectHostSetupOptions,
    selectedProjectHostSetupId: isFolderTarget ? null : target.selectedProjectHostSetupId,
    onProjectHostSetupChange: actions.handleProjectHostSetupChange,
    repoBackedSearchRepos: isFolderTarget ? target.folderSourceRepos : undefined,
    repoBackedSourcesDisabled: isFolderTarget ? target.folderSourceRepos.length === 0 : false,
    allowSmartNameAddProject: !isFolderTarget,
    smartNameRepoSwitchTarget: isFolderTarget ? 'project-source' : 'project',
    name: source.name,
    onNameValueChange: actions.handleNameValueChange,
    branchNameOverride: isFolderTarget ? undefined : source.branchNameOverride,
    onBranchNameOverrideChange: isFolderTarget ? () => {} : actions.handleBranchNameOverrideChange,
    onSmartGitHubItemSelect: actions.handleSmartGitHubItemSelect,
    onSmartBranchSelect: isFolderTarget ? () => {} : actions.handleSmartBranchSelect,
    onSmartNameModeChange: source.setSmartNameMode,
    smartNameGitHubSourceContext: github.selectedRepoGitHubSourceContext,
    smartNameSelection: actions.smartNameSelection,
    onClearSmartNameSelection: actions.handleClearSmartNameSelection,
    canReuseSelectedBranch:
      !isFolderTarget &&
      source.reuseEligibleBranch !== null &&
      actions.smartNameSelection?.kind === 'branch',
    reuseSelectedBranch: source.reuseSelectedBranch,
    onReuseSelectedBranchChange: actions.handleReuseSelectedBranchChange,
    // Why: folder workspaces are singular containers, while worktree targets
    // can remain open for a run of related workspace creations.
    showCreateMultiple: !isFolderTarget,
    createMultiple: form.createMultiple,
    onCreateMultipleChange: form.setCreateMultiple,
    agentPrompt: source.agentPrompt,
    onAgentPromptChange: source.setAgentPrompt,
    attachmentPaths: attachments.attachmentPaths,
    getAttachmentLabel,
    onAddAttachment: () => void attachments.handleAddAttachment(),
    onRemoveAttachment: (pathValue) =>
      attachments.setAttachmentPaths((current) =>
        current.filter((currentPath) => currentPath !== pathValue)
      ),
    linkedWorkItem: source.linkedWorkItem,
    onRemoveLinkedWorkItem: actions.handleRemoveLinkedWorkItem,
    linkPopoverOpen: linkPicker.isOpen,
    onLinkPopoverOpenChange: linkPicker.setOpen,
    linkQuery: linkPicker.query,
    onLinkQueryChange: linkPicker.setQuery,
    filteredLinkItems: linkPicker.filteredItems,
    linkItemsLoading: linkPicker.isLoading,
    linkDirectLoading: linkPicker.isDirectLoading,
    normalizedLinkQuery: linkPicker.normalizedQuery,
    onSelectLinkedItem: actions.handleSelectLinkedItem,
    tuiAgent: agent.agent,
    onTuiAgentChange: agent.setAgent,
    detectedAgentIds: isFolderTarget ? target.folderDetectedAgentIds : agent.detectedAgentIds,
    onOpenAgentSettings,
    advancedOpen: form.advancedOpen,
    onToggleAdvanced: () => form.setAdvancedOpen((current) => !current),
    createDisabled,
    projectError: isFolderTarget
      ? target.folderPathStatus.pathStatusProjectError
      : target.projectError,
    creating: form.creating,
    onCreate: () => void onSubmit(),
    baseBranch: isFolderTarget ? undefined : source.baseBranch,
    onBaseBranchChange: isFolderTarget ? () => {} : actions.handleBaseBranchChange,
    onBaseBranchPrSelect: isFolderTarget ? () => {} : actions.handleBaseBranchPrSelect,
    baseBranchLinkedPrNumber:
      source.linkedWorkItem?.type === 'pr' && source.baseBranch
        ? source.linkedWorkItem.number
        : null,
    selectedRepoPath: isFolderTarget ? null : (target.selectedRepo?.path ?? null),
    startFromResetHint: isFolderTarget ? null : source.startFromResetHint,
    forkPushWarning: isFolderTarget ? null : source.forkPushWarning,
    note: source.note,
    onNoteChange: source.setNote,
    setupConfig: isFolderTarget ? null : setup.setupConfig,
    requiresExplicitSetupChoice: isFolderTarget ? false : setup.requiresExplicitSetupChoice,
    setupDecision: isFolderTarget ? null : setup.setupDecision,
    onSetupDecisionChange: isFolderTarget ? () => {} : setup.handleSetupDecisionChange,
    setupAgentStartupPolicy: isFolderTarget ? 'start-immediately' : setup.setupAgentStartupPolicy,
    onSetupAgentStartupPolicyChange: isFolderTarget
      ? () => {}
      : setup.handleSetupAgentStartupPolicyChange,
    shouldWaitForSetupCheck: isFolderTarget ? false : setup.shouldWaitForSetupCheck,
    resolvedSetupDecision: isFolderTarget ? null : setup.resolvedSetupDecision,
    createError: source.createError,
    canUseSparseCheckout: isFolderTarget ? false : target.selectedRepoIsGit,
    sparsePresets: isFolderTarget ? [] : sparse.presets,
    sparseSelectedPresetId: isFolderTarget ? null : sparse.selectedPresetId,
    onSparseSelectPreset: isFolderTarget ? () => {} : actions.handleSparseSelectPreset,
    branchesEnabled: !isFolderTarget,
    setupControlsEnabled: !isFolderTarget,
    sparseControlsEnabled: !isFolderTarget
  }
}

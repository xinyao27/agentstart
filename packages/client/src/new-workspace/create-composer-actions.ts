import { buildWorkspaceSourceSelection } from '~renderer/new-workspace/naming/source'
import type { SmartWorkspaceNameSelection } from '~renderer/new-workspace/smart-workspace-name-field'
import { getSmartNameSelection as getFolderSmartNameSelection } from '~renderer/sidebar/folder-workspace-composer-model'

import { createComposerBranchSourceActions } from './composer-branch-source'
import { createComposerGitHubItemSelect } from './composer-github-source'
import { createComposerLinkedSourceActions } from './composer-linked-source'
import { createComposerTargetActions } from './composer-target-actions'
import {
  resolveSmartGitHubSubmit,
  type PendingSmartGitHubSubmitResolution
} from './resolve-smart-github-submit'
import type { useComposerForm } from './use-composer-form'

export function createComposerActions(form: ReturnType<typeof useComposerForm>) {
  const { github, linkPicker, source, sparse, target } = form
  const linked = createComposerLinkedSourceActions({
    branchAutoNameRef: source.branchAutoNameRef,
    branchNameOverride: source.branchNameOverride,
    branchNameOverridePreservesNameEdits: source.branchNameOverridePreservesNameEdits,
    forkPushWarning: source.forkPushWarning,
    lastAutoNameRef: source.lastAutoNameRef,
    linkedWorkItem: source.linkedWorkItem,
    name: source.name,
    pushTarget: source.pushTarget,
    setBranchNameOverride: source.setBranchNameOverride,
    setBranchNameOverridePreservesNameEdits: source.setBranchNameOverridePreservesNameEdits,
    setCreateError: source.setCreateError,
    setForkPushWarning: source.setForkPushWarning,
    setLinkPopoverOpen: linkPicker.setOpen,
    setLinkedPR: source.setLinkedPR,
    setLinkedWorkItem: source.setLinkedWorkItem,
    setName: source.setName,
    setPushTarget: source.setPushTarget,
    setReuseEligibleBranch: source.setReuseEligibleBranch,
    setReuseSelectedBranch: source.setReuseSelectedBranch,
    startPointSelectionRef: source.startPointSelectionRef
  })
  const resolvePendingSmartGitHubSubmit = (): Promise<PendingSmartGitHubSubmitResolution> =>
    resolveSmartGitHubSubmit({
      branchAutoNameRef: source.branchAutoNameRef,
      folderSourceRepos: target.folderSourceRepos,
      isProjectGroupTarget: target.isProjectGroupTarget,
      lastAutoNameRef: source.lastAutoNameRef,
      linkedWorkItem: source.linkedWorkItem,
      name: source.name,
      selectedRepo: target.selectedRepo,
      selectedRepoGitHubSourceContext: github.selectedRepoGitHubSourceContext,
      selectedRepoIsGit: target.selectedRepoIsGit,
      settings: target.settings,
      setBaseBranch: source.setBaseBranch,
      setBranchNameOverride: source.setBranchNameOverride,
      setBranchNameOverridePreservesNameEdits: source.setBranchNameOverridePreservesNameEdits,
      setCompareBaseRef: source.setCompareBaseRef,
      setForkPushWarning: source.setForkPushWarning,
      setLinkedPR: source.setLinkedPR,
      setLinkedWorkItem: source.setLinkedWorkItem,
      setName: source.setName,
      setPushTarget: source.setPushTarget,
      setStartFromResetHint: source.setStartFromResetHint,
      startPointSelectionRef: source.startPointSelectionRef
    })
  const targetActions = createComposerTargetActions({
    baseBranch: source.baseBranch,
    eligibleRepos: target.eligibleRepos,
    folderSourceRepos: target.folderSourceRepos,
    markInitialProjectGroupApplied: target.markInitialProjectGroupApplied,
    isProjectGroupTarget: target.isProjectGroupTarget,
    linkedWorkItem: source.linkedWorkItem,
    projectGroups: target.projectGroups,
    projectHostSetupOptions: target.projectHostSetupOptions,
    projectHostSetups: target.projectHostSetups,
    projects: target.projects,
    repoId: target.repoId,
    repos: target.repos,
    selectedWorkspaceTarget: target.selectedWorkspaceTarget,
    setBaseBranch: source.setBaseBranch,
    setBranchNameOverride: source.setBranchNameOverride,
    setBranchNameOverridePreservesNameEdits: source.setBranchNameOverridePreservesNameEdits,
    setCompareBaseRef: source.setCompareBaseRef,
    setForkPushWarning: source.setForkPushWarning,
    setLinkedPR: source.setLinkedPR,
    setLinkedWorkItem: source.setLinkedWorkItem,
    setProjectError: target.setProjectError,
    setPushTarget: source.setPushTarget,
    setRepoId: target.setRepoId,
    setReuseEligibleBranch: source.setReuseEligibleBranch,
    setReuseSelectedBranch: source.setReuseSelectedBranch,
    setSelectedProjectGroupId: target.setSelectedProjectGroupId,
    setSparseDirectories: sparse.setDirectories,
    setSparseEnabled: sparse.setEnabled,
    setSparseSelectedPresetId: sparse.setSelectedPresetId,
    setStartFromResetHint: source.setStartFromResetHint,
    startPointSelectionRef: source.startPointSelectionRef,
    workspaceHostScope: target.workspaceHostScope
  })
  const branch = createComposerBranchSourceActions({
    applyLinkedWorkItem: linked.applyLinkedWorkItem,
    branchAutoNameRef: source.branchAutoNameRef,
    lastAutoNameRef: source.lastAutoNameRef,
    lastAutoNoteRef: source.lastAutoNoteRef,
    name: source.name,
    noteRef: source.noteRef,
    repoId: target.repoId,
    repoWorktrees: target.worktreesByRepo[target.repoId] ?? [],
    reuseEligibleBranch: source.reuseEligibleBranch,
    setBaseBranch: source.setBaseBranch,
    setBranchNameOverride: source.setBranchNameOverride,
    setBranchNameOverridePreservesNameEdits: source.setBranchNameOverridePreservesNameEdits,
    setCompareBaseRef: source.setCompareBaseRef,
    setForkPushWarning: source.setForkPushWarning,
    setLinkedPR: source.setLinkedPR,
    setLinkedWorkItem: source.setLinkedWorkItem,
    setName: source.setName,
    setNote: source.setNote,
    setPushTarget: source.setPushTarget,
    setReuseEligibleBranch: source.setReuseEligibleBranch,
    setReuseSelectedBranch: source.setReuseSelectedBranch,
    setStartFromResetHint: source.setStartFromResetHint,
    startPointSelectionRef: source.startPointSelectionRef
  })
  const handleSmartGitHubItemSelect = createComposerGitHubItemSelect({
    applyLinkedWorkItem: linked.applyLinkedWorkItem,
    branchAutoNameRef: source.branchAutoNameRef,
    eligibleRepos: target.eligibleRepos,
    handleBaseBranchPrSelect: branch.handleBaseBranchPrSelect,
    isProjectGroupTarget: target.isProjectGroupTarget,
    lastAutoNameRef: source.lastAutoNameRef,
    name: source.name,
    selectedRepo: target.selectedRepo,
    setBaseBranch: source.setBaseBranch,
    setBranchNameOverride: source.setBranchNameOverride,
    setBranchNameOverridePreservesNameEdits: source.setBranchNameOverridePreservesNameEdits,
    setCompareBaseRef: source.setCompareBaseRef,
    setForkPushWarning: source.setForkPushWarning,
    setLinkedPR: source.setLinkedPR,
    setLinkedWorkItem: source.setLinkedWorkItem,
    setName: source.setName,
    setPushTarget: source.setPushTarget,
    setStartFromResetHint: source.setStartFromResetHint,
    settings: target.settings,
    startPointSelectionRef: source.startPointSelectionRef
  })
  const smartNameSelection = target.isProjectGroupTarget
    ? getFolderSmartNameSelection(source.linkedWorkItem)
    : (buildWorkspaceSourceSelection({
        linkedWorkItem: source.linkedWorkItem,
        baseBranch: source.baseBranch
      }) as SmartWorkspaceNameSelection | null)

  return {
    ...branch,
    ...linked,
    ...targetActions,
    handleSmartGitHubItemSelect,
    resolvePendingSmartGitHubSubmit,
    smartNameSelection
  }
}

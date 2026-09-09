import type { TuiAgent } from '@yiru/protocol/agent/types'
import { useShallow } from 'zustand/react/shallow'
import { getWorkspaceSeedName } from '~renderer/new-workspace/workspace-creation'
import { useAppStore } from '~renderer/store/state'

import type { UseComposerStateOptions } from './composer-contract'
import { resolveComposerCreate } from './composer-create-resolution'
import type { createComposerSubmissionGuard } from './composer-submission-guard'
import type { createComposerActions } from './create-composer-actions'
import {
  getFullComposerCreateDisabled,
  getQuickComposerCreateDisabled
} from './new-workspace-create-gates'
import { submitFolderWorkspace } from './submit-folder-workspace'
import { submitQuickWorkspace } from './submit-quick-workspace'
import { submitRepoWorkspace } from './submit-repo-workspace'
import type { useComposerForm } from './use-composer-form'

type UseComposerSubmissionsOptions = {
  actions: ReturnType<typeof createComposerActions>
  form: ReturnType<typeof useComposerForm>
  options: UseComposerStateOptions
  submissionGuard: ReturnType<typeof createComposerSubmissionGuard>
}

export function useComposerSubmissions({
  actions,
  form,
  options,
  submissionGuard
}: UseComposerSubmissionsOptions) {
  const runtime = useAppStore(
    useShallow((state) => ({
      clearDraft: state.clearNewWorkspaceDraft,
      createFolderWorkspace: state.createFolderWorkspace,
      createWorktree: state.createWorktree,
      setSidebarOpen: state.setSidebarOpen,
      updateWorktreeMeta: state.updateWorktreeMeta
    }))
  )
  const { agent, attachments, github, setup, source, sparse, target } = form
  const resolveCreate = async (workspaceNameSeed: string) => {
    const smartGitHubResolution = await actions.resolvePendingSmartGitHubSubmit()
    return resolveComposerCreate({
      baseBranch: source.baseBranch,
      branchAutoName: source.branchAutoNameRef.current,
      branchNameOverride: source.branchNameOverride,
      branchNameOverridePreservesNameEdits: source.branchNameOverridePreservesNameEdits,
      compareBaseRef: source.compareBaseRef,
      effectiveLinkedPR: github.effectiveLinkedPR,
      fallbackWorkspaceName: form.fallbackCreatureName,
      lastAutoName: source.lastAutoNameRef.current,
      linkedWorkItem: source.linkedWorkItem,
      name: source.name,
      pushTarget: source.pushTarget,
      smartGitHubResolution,
      smartNameMode: source.smartNameMode,
      smartNameSelection: actions.smartNameSelection,
      workspaceNameSeed
    })
  }
  const folderCreateDisabled =
    form.creating ||
    !target.selectedProjectGroup?.parentPath ||
    target.folderPathStatus.pathStatusBlocksCreate
  const submitFolderTarget = (requestedAgent: TuiAgent | null): Promise<void> =>
    submitFolderWorkspace({
      clearDraft: runtime.clearDraft,
      createFolderWorkspace: (input) =>
        runtime.createFolderWorkspace(input, {
          runtimeEnvironmentId: target.folderRuntimeEnvironmentId
        }),
      disabledAgents: agent.disabledAgents,
      isDisabled: folderCreateDisabled,
      isRemote: target.folderRuntimeEnvironmentId !== null,
      lastAutoName: source.lastAutoNameRef.current,
      linkedWorkItem: source.linkedWorkItem,
      name: source.name,
      note: source.note,
      onCreated: options.onCreated,
      persistDraft: options.persistDraft,
      projectGroup: target.selectedProjectGroup,
      requestedAgent,
      resolveSmartGitHub: async () => {
        if (target.folderSourceRepos.length === 0) {
          return { kind: 'none' }
        }
        const resolution = await actions.resolvePendingSmartGitHubSubmit()
        return resolution.kind === 'none'
          ? resolution
          : {
              kind: 'resolved',
              linkedWorkItem: resolution.linkedWorkItem,
              workspaceName: resolution.workspaceName
            }
      },
      runtimeEnvironmentId: target.folderRuntimeEnvironmentId,
      setCreateError: source.setCreateError,
      setCreating: form.setCreating,
      settings: target.settings,
      submissionGuard,
      telemetrySource: options.telemetrySource
    })
  const sparseCheckout =
    target.selectedRepoIsGit && sparse.isEnabled
      ? {
          directories: sparse.normalizedDirectories,
          ...(sparse.effectivePresetId ? { presetId: sparse.effectivePresetId } : {})
        }
      : undefined

  const submit = async (): Promise<void> => {
    if (target.isProjectGroupTarget) {
      await submitFolderTarget(agent.agent)
      return
    }
    if (!target.repoId || !target.selectedRepo) {
      actions.showProjectRequiredError()
      return
    }
    if (
      !form.workspaceSeedName ||
      setup.shouldWaitForSetupCheck ||
      (setup.requiresExplicitSetupChoice && !setup.setupDecision) ||
      sparse.error !== null
    ) {
      return
    }
    await submitRepoWorkspace({
      agent: agent.agent,
      agentPlatform: target.agentPlatform,
      agentPrompt: source.agentPrompt,
      attachmentPaths: attachments.attachmentPaths,
      clearDraft: runtime.clearDraft,
      createWorktree: runtime.createWorktree,
      disabledAgents: agent.disabledAgents,
      fallbackAgent: agent.fallbackAgent,
      isDisabled: false,
      isGit: target.selectedRepoIsGit,
      name: source.name,
      note: source.note,
      onCreated: options.onCreated,
      persistDraft: options.persistDraft,
      persistSetupAgentStartupPolicy: setup.persistSetupAgentStartupPolicy,
      repoId: target.repoId,
      resolveCreate: () => resolveCreate(form.workspaceSeedName),
      resolvedSetupDecision: setup.resolvedSetupDecision,
      setCreateError: source.setCreateError,
      setCreating: form.setCreating,
      setFallbackAgent: agent.setAgent,
      setSidebarOpen: runtime.setSidebarOpen,
      settings: target.settings,
      shell: target.startupShell,
      sparseCheckout,
      submissionGuard,
      telemetrySource: options.telemetrySource,
      updateWorktreeMeta: runtime.updateWorktreeMeta,
      workspaceStatus: target.workspaceStatus
    })
  }

  const resetForNextCreate = (): void => {
    source.setName('')
    source.resetAutoManagedName()
    source.setAgentPrompt('')
    source.setNote('')
    attachments.setAttachmentPaths([])
    source.setLinkedWorkItem(null)
    source.setLinkedPR(null)
    source.setBranchNameOverride(undefined)
    source.setBranchNameOverridePreservesNameEdits(false)
    source.setCompareBaseRef(undefined)
    source.setPushTarget(undefined)
    source.setReuseSelectedBranch(false)
    source.setStartFromResetHint(null)
    source.setForkPushWarning(null)
    source.setCreateError(null)
    requestAnimationFrame(() => form.nameInputRef.current?.focus())
  }

  const submitQuick = async (requestedAgent: TuiAgent | null): Promise<void> => {
    if (target.isProjectGroupTarget) {
      await submitFolderTarget(requestedAgent)
      return
    }
    const workspaceNameSeed = getWorkspaceSeedName({
      explicitName: source.name,
      prompt: '',
      linkedPR: source.linkedPR,
      fallbackName: form.fallbackCreatureName
    })
    if (!target.repoId || !target.selectedRepo) {
      actions.showProjectRequiredError()
      return
    }
    if (
      !workspaceNameSeed ||
      (setup.requiresExplicitSetupChoice && !setup.setupDecision) ||
      sparse.error !== null
    ) {
      return
    }
    await submitQuickWorkspace({
      agentPlatform: target.agentPlatform,
      checkedHooksRepoId: setup.checkedHooksRepoId,
      clearDraft: runtime.clearDraft,
      commitHookCheckIfCurrent: setup.commitHookCheckIfCurrent,
      createMultiple: form.createMultiple,
      disabledAgents: agent.disabledAgents,
      isGit: target.selectedRepoIsGit,
      loadHookCheckForRepo: setup.loadHookCheckForRepo,
      name: source.name,
      note: source.note,
      onCreated: options.onCreated,
      persistDraft: options.persistDraft,
      persistSetupAgentStartupPolicy: setup.persistSetupAgentStartupPolicy,
      projectSourceContext: github.projectSourceContext,
      repo: target.selectedRepo,
      repoId: target.repoId,
      repoSettings: target.repoSettings,
      requestedAgent,
      resetForNextCreate,
      resolveCreate: () => resolveCreate(workspaceNameSeed),
      resolvedSetupDecision: setup.resolvedSetupDecision,
      selectedWorkspaceTarget: target.selectedWorkspaceTarget,
      setAdvancedOpen: form.setAdvancedOpen,
      setCreateError: source.setCreateError,
      setCreating: form.setCreating,
      settings: target.settings,
      setupConfig: setup.setupConfig,
      setupDecision: setup.setupDecision,
      setupPolicy: setup.setupPolicy,
      shell: target.startupShell,
      sparseCheckout,
      submissionGuard,
      telemetrySource: options.telemetrySource,
      workspaceStatus: target.workspaceStatus
    })
  }
  const gateInput = {
    repoId: target.repoId,
    workspaceSeedName: form.workspaceSeedName,
    creating: form.creating,
    shouldWaitForSetupCheck: setup.shouldWaitForSetupCheck,
    requiresExplicitSetupChoice: setup.requiresExplicitSetupChoice,
    hasSetupDecision: Boolean(setup.setupDecision),
    sparseError: sparse.error
  }
  const repoCreateDisabled =
    options.createGateMode === 'quick'
      ? getQuickComposerCreateDisabled(gateInput)
      : getFullComposerCreateDisabled(gateInput)
  return {
    createDisabled: target.isProjectGroupTarget ? folderCreateDisabled : repoCreateDisabled,
    submit,
    submitQuick
  }
}

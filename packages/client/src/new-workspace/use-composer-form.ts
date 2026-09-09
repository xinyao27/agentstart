import { useRef, useState } from 'react'
import { getWorkspaceSeedName } from '~renderer/new-workspace/workspace-creation'
import { getSuggestedCreatureName } from '~renderer/sidebar/worktree-name-suggestions'
import { useAppStore } from '~renderer/store/state'

import type { UseComposerStateOptions } from './composer-contract'
import { useComposerAgent } from './use-composer-agent'
import { useComposerAttachments } from './use-composer-attachments'
import { useComposerGitHubContext } from './use-composer-github-context'
import { useComposerSetup } from './use-composer-setup'
import { useComposerSourceState } from './use-composer-source-state'
import { useComposerSparse } from './use-composer-sparse'
import { useComposerSync } from './use-composer-sync'
import { useComposerTarget } from './use-composer-target'
import { useLinkedWorkItemPicker } from './use-linked-work-item-picker'

export function useComposerForm(options: UseComposerStateOptions) {
  const target = useComposerTarget({
    initialProjectGroupId: options.initialProjectGroupId,
    initialProjectSourceContext: options.initialProjectSourceContext,
    initialRepoId: options.initialRepoId,
    initialWorkspaceStatus: options.initialWorkspaceStatus,
    onRepoIdOverrideChange: options.onRepoIdOverrideChange,
    persistDraft: options.persistDraft,
    repoIdOverride: options.repoIdOverride
  })
  const source = useComposerSourceState({
    draft: target.newWorkspaceDraft,
    initialBaseBranch: options.initialBaseBranch,
    initialLinkedWorkItem: options.initialLinkedWorkItem,
    initialName: options.initialName,
    initialPrompt: options.initialPrompt,
    persistDraft: options.persistDraft
  })
  const github = useComposerGitHubContext({
    draft: target.newWorkspaceDraft,
    initialLinkedWorkItem: options.initialLinkedWorkItem,
    initialProjectSourceContext: options.initialProjectSourceContext,
    linkedPR: source.linkedPR,
    linkedWorkItem: source.linkedWorkItem,
    name: source.name,
    persistDraft: options.persistDraft,
    projects: target.projects,
    repoId: target.repoId,
    repoSettings: target.repoSettings,
    selectedRepo: target.selectedRepo,
    selectedRepoIsGit: target.selectedRepoIsGit,
    selectedWorkspaceTarget: target.selectedWorkspaceTarget
  })
  const runtimeEnvironmentId = target.repoSettings?.activeRuntimeEnvironmentId?.trim() || null
  const agent = useComposerAgent({
    initialAgent: options.persistDraft ? (target.newWorkspaceDraft?.agent ?? null) : null,
    runtimeEnvironmentId,
    settings: target.settings
  })
  const fetchSparsePresets = useAppStore((state) => state.fetchSparsePresets)
  const sparse = useComposerSparse({
    fetchSparsePresets,
    isGit: target.selectedRepoIsGit,
    presetsByRepo: target.sparsePresetsByRepo,
    repoId: target.repoId
  })
  const setup = useComposerSetup({
    repoId: target.repoId,
    repos: target.repos,
    selectedRepo: target.selectedRepo,
    selectedRepoIsGit: target.selectedRepoIsGit,
    selectedRepoSettings: target.repoSettings
  })
  const attachments = useComposerAttachments({
    agentPrompt: source.agentPrompt,
    initialPaths: options.persistDraft ? (target.newWorkspaceDraft?.attachments ?? []) : [],
    selectedRepoPath: github.selectedRepoPath,
    selectedRepoSettings: target.repoSettings,
    setAgentPrompt: source.setAgentPrompt
  })
  const linkPicker = useLinkedWorkItemPicker({
    selectedRepo: target.selectedRepo,
    selectedRepoGitHubSourceContext: github.selectedRepoGitHubSourceContext,
    selectedRepoIsGit: target.selectedRepoIsGit,
    selectedRepoSettings: target.repoSettings
  })
  const [creating, setCreating] = useState(false)
  const [createMultiple, setCreateMultiple] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(
    options.persistDraft ? Boolean((target.newWorkspaceDraft?.note ?? '').trim()) : false
  )
  const composerRef = useRef<HTMLDivElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const fallbackCreatureName = getSuggestedCreatureName(target.worktreesByRepo)
  const workspaceSeedName = getWorkspaceSeedName({
    explicitName: source.name,
    prompt: source.agentPrompt,
    linkedPR: source.linkedPR,
    fallbackName: fallbackCreatureName
  })
  const prefetchWorkItems = useAppStore((state) => state.prefetchWorkItems)
  const prefetchWorktreeCreateBase = useAppStore((state) => state.prefetchWorktreeCreateBase)
  const setNewWorkspaceDraft = useAppStore((state) => state.setNewWorkspaceDraft)
  useComposerSync({
    agent: agent.agent,
    agentPrompt: source.agentPrompt,
    attachmentPaths: attachments.attachmentPaths,
    baseBranch: source.baseBranch,
    compareBaseRef: source.compareBaseRef,
    eligibleRepos: target.eligibleRepos,
    folderSourceRepos: target.folderSourceRepos,
    isProjectGroupTarget: target.isProjectGroupTarget,
    linkedPR: source.linkedPR,
    linkedWorkItem: source.linkedWorkItem,
    name: source.name,
    note: source.note,
    persistDraft: options.persistDraft,
    prefetchWorkItems,
    prefetchWorktreeCreateBase,
    projectSourceContext: github.projectSourceContext,
    repoId: target.repoId,
    selectedProjectGroup: target.selectedProjectGroup,
    selectedRepo: target.selectedRepo,
    selectedRepoIsGit: target.selectedRepoIsGit,
    selectedWorkspaceTarget: target.selectedWorkspaceTarget,
    setNewWorkspaceDraft,
    setRepoId: target.setRepoId
  })

  return {
    advancedOpen,
    agent,
    attachments,
    composerRef,
    createMultiple,
    creating,
    fallbackCreatureName,
    github,
    linkPicker,
    nameInputRef,
    setAdvancedOpen,
    setCreateMultiple,
    setCreating,
    setup,
    source,
    sparse,
    target,
    workspaceSeedName
  }
}

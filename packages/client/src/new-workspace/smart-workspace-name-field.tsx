import type { GitHubWorkItem } from '@yiru/protocol/hosted-review/review-types'
import {
  buildProjectSourceContextFromRepo,
  type ProjectSourceContext
} from '@yiru/protocol/project/source-context'
import React, { useRef, useState } from 'react'
import type { RepoSlug } from '~renderer/github/links'
import { lookupGitHubWorkItemByOwnerRepoForSource } from '~renderer/github/work-item-source-lookup'
import { useAppStore } from '~renderer/store/state'

import { CrossRepoPromptDialog } from './cross-repo-prompt-dialog'
import { getRepoSlugCached, sameRepoSlug, type SmartWorkspaceRepo } from './github-repo-match'
import type { SmartWorkspaceNameSelection } from './smart-workspace-name-rows'
import { SmartWorkspaceNameView } from './smart-workspace-name-view'
import { buildSmartWorkspaceSourceRows, type SmartNameMode } from './smart-workspace-source-results'
import { useSmartBranchSearch } from './use-smart-branch-search'
import { type CrossRepoPrompt, useSmartGithubSearch } from './use-smart-github-search'
import { useSmartWorkspaceInput } from './use-smart-workspace-input'

type RepoOption = SmartWorkspaceRepo
const EMPTY_REPO_SEARCH_REPOS: readonly RepoOption[] = []

type SmartWorkspaceNameFieldProps = {
  repos: RepoOption[]
  repoId: string
  onRepoChange: (repoId: string) => void
  value: string
  onValueChange: (value: string) => void
  onGitHubItemSelect: (item: GitHubWorkItem) => void
  onBranchSelect: (refName: string, localBranchName: string) => void
  selectedSource: SmartWorkspaceNameSelection | null
  onClearSelectedSource: () => void
  githubSourceContext?: ProjectSourceContext | null
  inputRef?: React.RefObject<HTMLInputElement | null>
  onPlainEnter?: () => void
  disabled?: boolean
  disabledPlaceholder?: string
  textOnly?: boolean
  branchesEnabled?: boolean
  repoBackedSourcesDisabled?: boolean
  repoBackedSearchRepos?: readonly RepoOption[]
  allowCrossRepoProjectAdd?: boolean
  crossRepoSwitchTarget?: 'project' | 'project-source'
  onActiveSourceModeChange?: (mode: SmartNameMode) => void
}

export type { SmartWorkspaceNameSelection } from './smart-workspace-name-rows'

const RESULT_LIMIT = 12

export default function SmartWorkspaceNameField({
  repos,
  repoId,
  onRepoChange,
  value,
  onValueChange,
  onGitHubItemSelect,
  onBranchSelect,
  selectedSource,
  onClearSelectedSource,
  githubSourceContext: githubSourceContextOverride,
  inputRef,
  onPlainEnter,
  disabled = false,
  disabledPlaceholder,
  textOnly = false,
  branchesEnabled = true,
  repoBackedSourcesDisabled = false,
  repoBackedSearchRepos = EMPTY_REPO_SEARCH_REPOS,
  allowCrossRepoProjectAdd = true,
  crossRepoSwitchTarget = 'project',
  onActiveSourceModeChange
}: SmartWorkspaceNameFieldProps): React.JSX.Element {
  const addRepo = useAppStore((state) => state.addRepo)
  const selectedRepo = (() => repos.find((repo) => repo.id === repoId) ?? null)()
  const githubSourceContext = (() => {
    if (githubSourceContextOverride?.provider === 'github') {
      return githubSourceContextOverride
    }
    return selectedRepo
      ? buildProjectSourceContextFromRepo({
          provider: 'github',
          projectId: selectedRepo.id,
          repo: selectedRepo
        })
      : null
  })()
  const repoBackedSearchTargets = (() =>
    (repoBackedSearchRepos.length > 0
      ? repoBackedSearchRepos
      : selectedRepo
        ? [selectedRepo]
        : []
    ).map((repo) => ({
      repo,
      githubSourceContext:
        repo.id === selectedRepo?.id && githubSourceContext?.provider === 'github'
          ? githubSourceContext
          : buildProjectSourceContextFromRepo({
              provider: 'github',
              projectId: repo.id,
              repo
            })
    })))()
  const repoSlugCacheRef = useRef<Map<string, RepoSlug | null>>(new Map())
  const [handledCrossRepoUrl, setHandledCrossRepoUrl] = useState<string | null>(null)
  const [crossRepoPromptState, setCrossRepoPromptState] = useState<CrossRepoPrompt | null>(null)
  const input = useSmartWorkspaceInput({
    branchesEnabled,
    disabled,
    inputRef,
    onActiveSourceModeChange,
    repoBackedSourcesDisabled,
    selectedSource,
    textOnly,
    value
  })
  const {
    availableModes,
    cancelInputFocusFrame: cancelLocalInputFocusFrame,
    commandValue,
    debouncedQuery,
    handlePopoverOpenChange: handleSourcePopoverOpenChange,
    localInputFocusFrameRef,
    localInputRef,
    markPopoverEngaged: markSourcePopoverUserEngaged,
    mode,
    setCommandValue,
    setInputNode,
    setMode,
    setOpen,
    setSelectedSourceNode,
    tabsListRef,
    tryOpenPopover: tryOpenSourcePopover
  } = input
  const crossRepoPrompt =
    crossRepoPromptState &&
    !disabled &&
    !repoBackedSourcesDisabled &&
    crossRepoPromptState.query === debouncedQuery.trim()
      ? crossRepoPromptState
      : null
  const isSourcePopoverOpen = input.isPopoverOpen && !crossRepoPrompt

  const githubSearch = useSmartGithubSearch({
    crossRepoSwitchTarget,
    debouncedQuery,
    disabled,
    githubSourceContext,
    handledCrossRepoUrl,
    mode,
    repoBackedSearchTargets,
    repoBackedSourcesDisabled,
    repoSlugCacheRef,
    repos,
    selectedRepo,
    setHandledCrossRepoUrl,
    setCrossRepoPrompt: setCrossRepoPromptState,
    textOnly
  })
  const branchSearch = useSmartBranchSearch({
    branchesEnabled,
    debouncedQuery,
    disabled,
    mode,
    repoBackedSourcesDisabled,
    selectedRepo,
    textOnly,
    value
  })

  const rows = (() =>
    buildSmartWorkspaceSourceRows({
      branches: branchSearch.items,
      githubItems: githubSearch.items,
      mode,
      resultLimit: RESULT_LIMIT,
      value
    }))()
  const loading = githubSearch.isLoading || branchSearch.isLoading

  const acceptGitHubLink = async (targetRepo: RepoOption): Promise<void> => {
    if (!crossRepoPrompt) {
      return
    }
    setHandledCrossRepoUrl(debouncedQuery.trim())
    const sourceContext = buildProjectSourceContextFromRepo({
      provider: 'github',
      projectId: targetRepo.id,
      repo: targetRepo
    })
    const item = await lookupGitHubWorkItemByOwnerRepoForSource({
      repoPath: targetRepo.path,
      repoId: targetRepo.id,
      sourceContext,
      owner: crossRepoPrompt.link.slug.owner,
      repo: crossRepoPrompt.link.slug.repo,
      number: crossRepoPrompt.link.number,
      type: crossRepoPrompt.link.type
    })
    if (!item) {
      return
    }
    onRepoChange(targetRepo.id)
    onGitHubItemSelect({ ...item, repoId: targetRepo.id } as GitHubWorkItem)
    setOpen(false)
    setCrossRepoPromptState(null)
  }

  const handleUseCurrentRepo = async (): Promise<void> => {
    if (!selectedRepo) {
      return
    }
    setCrossRepoPromptState(null)
    await acceptGitHubLink(selectedRepo)
  }

  const handleAddMatchingRepo = async (): Promise<void> => {
    if (!crossRepoPrompt || !allowCrossRepoProjectAdd) {
      return
    }
    const added = await addRepo()
    if (!added) {
      return
    }
    repoSlugCacheRef.current.delete(added.id)
    const slug = await getRepoSlugCached(added, repoSlugCacheRef.current)
    if (slug && sameRepoSlug(slug, crossRepoPrompt.link.slug)) {
      await acceptGitHubLink(added)
    }
  }

  const dismissCrossRepoPrompt = (): void => {
    setHandledCrossRepoUrl(debouncedQuery.trim())
    setCrossRepoPromptState(null)
  }

  return (
    <>
      <SmartWorkspaceNameView
        availableModes={availableModes}
        branchesEnabled={branchesEnabled}
        cancelLocalInputFocusFrame={cancelLocalInputFocusFrame}
        commandValue={commandValue}
        debouncedQuery={debouncedQuery}
        disabled={disabled}
        disabledPlaceholder={disabledPlaceholder}
        handleSourcePopoverOpenChange={handleSourcePopoverOpenChange}
        isSourcePopoverOpen={isSourcePopoverOpen}
        loading={loading}
        localInputFocusFrameRef={localInputFocusFrameRef}
        localInputRef={localInputRef}
        markSourcePopoverUserEngaged={markSourcePopoverUserEngaged}
        mode={mode}
        onActiveSourceModeChange={onActiveSourceModeChange}
        onBranchSelect={onBranchSelect}
        onClearSelectedSource={onClearSelectedSource}
        onGitHubItemSelect={onGitHubItemSelect}
        onPlainEnter={onPlainEnter}
        onValueChange={onValueChange}
        repoBackedSourcesDisabled={repoBackedSourcesDisabled}
        rows={rows}
        selectedSource={selectedSource}
        setCommandValue={setCommandValue}
        setInputNode={setInputNode}
        setMode={setMode}
        setOpen={setOpen}
        setSelectedSourceNode={setSelectedSourceNode}
        tabsListRef={tabsListRef}
        textOnly={textOnly}
        tryOpenSourcePopover={tryOpenSourcePopover}
        value={value}
      />
      <CrossRepoPromptDialog
        allowProjectAdd={allowCrossRepoProjectAdd}
        onAccept={(repo) => void acceptGitHubLink(repo)}
        onAdd={() => void handleAddMatchingRepo()}
        onDismiss={dismissCrossRepoPrompt}
        onKeep={() => void handleUseCurrentRepo()}
        prompt={crossRepoPrompt}
        selectedRepo={selectedRepo}
        switchTarget={crossRepoSwitchTarget}
      />
    </>
  )
}

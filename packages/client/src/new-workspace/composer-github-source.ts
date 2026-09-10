import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'
import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { shouldApplyWorkspaceSourceAutoName } from '~renderer/new-workspace/naming/source'
import { getSettingsForRepoRuntimeOwner } from '~renderer/repo/runtime-owner'
import {
  getLinkedItemDisplayName,
  toGitHubLinkedWorkItem
} from '~renderer/sidebar/folder-workspace-composer-model'

import type { ComposerLinkedSourceActions } from './composer-linked-source'
import { getForkPushWarning } from './fork-push-warning'
import { resolveGitHubPrStartPointForRepo } from './github-pr-start-point'
import type { SmartGitHubPrStartPointSelection } from './resolve-smart-github-submit'
import type { LinkedWorkItemSummary } from './workspace-creation'

type ComposerGitHubSourceOptions = {
  applyLinkedWorkItem: ComposerLinkedSourceActions['applyLinkedWorkItem']
  branchAutoNameRef: RefObject<string>
  eligibleRepos: Repo[]
  handleBaseBranchPrSelect: (
    baseBranch: string,
    item: GitHubWorkItem,
    pushTarget?: GitPushTarget,
    branchNameOverride?: string,
    compareBaseRef?: string
  ) => void
  isProjectGroupTarget: boolean
  lastAutoNameRef: RefObject<string>
  name: string
  selectedRepo: Repo | undefined
  setBaseBranch: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverride: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverridePreservesNameEdits: Dispatch<SetStateAction<boolean>>
  setCompareBaseRef: Dispatch<SetStateAction<string | undefined>>
  setForkPushWarning: Dispatch<SetStateAction<string | null>>
  setLinkedPR: Dispatch<SetStateAction<number | null>>
  setLinkedWorkItem: Dispatch<SetStateAction<LinkedWorkItemSummary | null>>
  setName: Dispatch<SetStateAction<string>>
  setPushTarget: Dispatch<SetStateAction<GitPushTarget | undefined>>
  setStartFromResetHint: Dispatch<SetStateAction<string | null>>
  settings: GlobalSettings | null
  startPointSelectionRef: RefObject<SmartGitHubPrStartPointSelection | null>
}

export function createComposerGitHubItemSelect(options: ComposerGitHubSourceOptions) {
  return (item: GitHubWorkItem): void => {
    if (options.isProjectGroupTarget) {
      const linkedItem = toGitHubLinkedWorkItem(item)
      options.setLinkedPR(item.number)
      options.setLinkedWorkItem(linkedItem)
      const nextName = getLinkedItemDisplayName(linkedItem)
      if (
        nextName &&
        shouldApplyWorkspaceSourceAutoName({
          currentName: options.name,
          lastAutoName: options.lastAutoNameRef.current
        })
      ) {
        options.setName(nextName)
        options.lastAutoNameRef.current = nextName
      }
      return
    }
    options.setStartFromResetHint(null)
    options.setBranchNameOverride(undefined)
    options.setBranchNameOverridePreservesNameEdits(false)
    options.setForkPushWarning(null)
    options.branchAutoNameRef.current = ''
    options.startPointSelectionRef.current = null
    const runRepo =
      options.selectedRepo ?? options.eligibleRepos.find((repo) => repo.id === item.repoId)
    options.applyLinkedWorkItem(item)
    options.setBaseBranch(undefined)
    options.setCompareBaseRef(undefined)
    options.setPushTarget(undefined)
    if (!runRepo) {
      return
    }
    const selection: SmartGitHubPrStartPointSelection = {
      repoId: runRepo.id,
      item
    }
    options.startPointSelectionRef.current = selection
    const repoSettings = getSettingsForRepoRuntimeOwner(
      { repos: [runRepo], settings: options.settings },
      runRepo.id
    )
    void resolveGitHubPrStartPointForRepo({
      repoId: runRepo.id,
      prNumber: item.number,
      settings: repoSettings,
      ...(item.branchName ? { headRefName: item.branchName } : {}),
      ...(item.baseRefName ? { baseRefName: item.baseRefName } : {}),
      ...(item.isCrossRepository !== undefined ? { isCrossRepository: item.isCrossRepository } : {})
    })
      .then((result) => {
        if (options.startPointSelectionRef.current !== selection) {
          return
        }
        selection.resolved = result
        options.handleBaseBranchPrSelect(
          result.baseBranch,
          item,
          result.pushTarget,
          result.branchNameOverride,
          result.compareBaseRef
        )
        options.setForkPushWarning(getForkPushWarning(result))
      })
      .catch((error: unknown) => {
        if (options.startPointSelectionRef.current !== selection) {
          return
        }
        options.setBaseBranch(undefined)
        options.setCompareBaseRef(undefined)
        options.setPushTarget(undefined)
        toast.error(
          error instanceof Error
            ? error.message
            : translate('auto.hooks.useComposerState.b2ead86962', 'Failed to resolve PR base.')
        )
      })
  }
}

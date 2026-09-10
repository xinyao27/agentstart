import type { GitHubPrStartPoint, GitPushTarget } from '@agentstart/protocol/git/worktree-source'
import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { Repo } from '@agentstart/protocol/project/repository'
import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import {
  buildProjectSourceContextFromRepo,
  type ProjectSourceContext
} from '@agentstart/protocol/project/source-context'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import {
  lookupGitHubWorkItemByOwnerRepoForSource,
  lookupGitHubWorkItemForSource
} from '~renderer/github/work-item-source-lookup'
import { translate } from '~renderer/i18n/i18n'
import { getWorkspaceSourceProvider as getLinkedWorkItemProvider } from '~renderer/new-workspace/naming/source'
import { getSettingsForRepoRuntimeOwner } from '~renderer/repo/runtime-owner'

import { getForkPushWarning } from './fork-push-warning'
import { resolveGitHubPrStartPointForRepo } from './github-pr-start-point'
import {
  getSmartGitHubSubmitIntent,
  getSmartGitHubSubmitResolution,
  lookupSmartGitHubSubmitItem,
  type SmartGitHubSubmitResolution
} from './smart-github-submit'
import type { LinkedWorkItemSummary } from './workspace-creation'

export type PendingSmartGitHubSubmitResolution =
  | { kind: 'none' }
  | (SmartGitHubSubmitResolution & { kind: 'metadata-only' })
  | (SmartGitHubSubmitResolution & {
      kind: 'pr-start-point'
      baseBranch: string
      compareBaseRef?: string
      pushTarget?: GitPushTarget
      branchNameOverride?: string
    })

export type SmartGitHubPrStartPointSelection = {
  repoId: string
  item: GitHubWorkItem
  resolved?: GitHubPrStartPoint
}

type ResolveSmartGitHubSubmitOptions = {
  branchAutoNameRef: RefObject<string>
  folderSourceRepos: Repo[]
  isProjectGroupTarget: boolean
  lastAutoNameRef: RefObject<string>
  linkedWorkItem: LinkedWorkItemSummary | null
  name: string
  selectedRepo: Repo | undefined
  selectedRepoGitHubSourceContext: ProjectSourceContext | null
  selectedRepoIsGit: boolean
  settings: GlobalSettings | null
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
  startPointSelectionRef: RefObject<SmartGitHubPrStartPointSelection | null>
}

export async function resolveSmartGitHubSubmit({
  branchAutoNameRef,
  folderSourceRepos,
  isProjectGroupTarget,
  lastAutoNameRef,
  linkedWorkItem,
  name,
  selectedRepo,
  selectedRepoGitHubSourceContext,
  selectedRepoIsGit,
  settings,
  setBaseBranch,
  setBranchNameOverride,
  setBranchNameOverridePreservesNameEdits,
  setCompareBaseRef,
  setForkPushWarning,
  setLinkedPR,
  setLinkedWorkItem,
  setName,
  setPushTarget,
  setStartFromResetHint,
  startPointSelectionRef
}: ResolveSmartGitHubSubmitOptions): Promise<PendingSmartGitHubSubmitResolution> {
  if (linkedWorkItem) {
    const selection = startPointSelectionRef.current
    if (
      !isProjectGroupTarget &&
      linkedWorkItem.type === 'pr' &&
      getLinkedWorkItemProvider(linkedWorkItem) === 'github' &&
      selectedRepo &&
      selectedRepoIsGit &&
      selection?.repoId === selectedRepo.id &&
      selection.item.number === linkedWorkItem.number
    ) {
      const startPoint =
        selection.resolved ??
        (await resolveGitHubPrStartPointForRepo({
          repoId: selectedRepo.id,
          prNumber: selection.item.number,
          settings: getSettingsForRepoRuntimeOwner(
            { repos: [selectedRepo], settings },
            selectedRepo.id
          ),
          ...(selection.item.branchName ? { headRefName: selection.item.branchName } : {}),
          ...(selection.item.baseRefName ? { baseRefName: selection.item.baseRefName } : {}),
          ...(selection.item.isCrossRepository !== undefined
            ? { isCrossRepository: selection.item.isCrossRepository }
            : {})
        }))
      selection.resolved = startPoint
      const resolution = createStartPointResolution(selection.item, startPoint)
      applyStartPoint(startPoint, {
        setBaseBranch,
        setBranchNameOverride,
        setBranchNameOverridePreservesNameEdits,
        setCompareBaseRef,
        setForkPushWarning,
        setPushTarget
      })
      return resolution
    }
    return { kind: 'none' }
  }
  const intent = getSmartGitHubSubmitIntent(name)
  if (!intent) {
    return { kind: 'none' }
  }
  const item = isProjectGroupTarget
    ? (
        await Promise.all(
          folderSourceRepos.filter(isGitRepoKind).map((repo) =>
            lookupSmartGitHubSubmitItem({
              repoPath: repo.path,
              repoId: repo.id,
              sourceContext: buildProjectSourceContextFromRepo({
                provider: 'github',
                projectId: repo.id,
                repo
              }),
              intent,
              workItem: lookupGitHubWorkItemForSource,
              workItemByOwnerRepo: lookupGitHubWorkItemByOwnerRepoForSource
            }).catch(() => null)
          )
        )
      )
        .filter((candidate): candidate is GitHubWorkItem => candidate !== null)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0]
    : selectedRepo && selectedRepoIsGit
      ? await lookupSmartGitHubSubmitItem({
          repoPath: selectedRepo.path,
          repoId: selectedRepo.id,
          sourceContext: selectedRepoGitHubSourceContext,
          intent,
          workItem: lookupGitHubWorkItemForSource,
          workItemByOwnerRepo: lookupGitHubWorkItemByOwnerRepoForSource
        })
      : null
  if (!item) {
    throw new Error(
      translate(
        'auto.newWorkspace.resolveSmartGithubSubmit.a9f6c4d231',
        'Could not resolve the GitHub item before creating the workspace.'
      )
    )
  }
  const startPoint =
    !isProjectGroupTarget && selectedRepo && selectedRepoIsGit
      ? await resolveGitHubPrStartPointForRepo({
          repoId: selectedRepo.id,
          prNumber: item.number,
          settings: getSettingsForRepoRuntimeOwner(
            { repos: [selectedRepo], settings },
            selectedRepo.id
          ),
          ...(item.branchName ? { headRefName: item.branchName } : {}),
          ...(item.baseRefName ? { baseRefName: item.baseRefName } : {}),
          ...(item.isCrossRepository !== undefined
            ? { isCrossRepository: item.isCrossRepository }
            : {})
        })
      : null
  const resolution: Exclude<PendingSmartGitHubSubmitResolution, { kind: 'none' }> = startPoint
    ? createStartPointResolution(item, startPoint)
    : { ...getSmartGitHubSubmitResolution(item), kind: 'metadata-only' }
  setLinkedPR(resolution.linkedPR)
  setLinkedWorkItem(resolution.linkedWorkItem)
  setName(resolution.workspaceName)
  lastAutoNameRef.current = resolution.workspaceName
  if (startPoint) {
    applyStartPoint(startPoint, {
      setBaseBranch,
      setBranchNameOverride,
      setBranchNameOverridePreservesNameEdits,
      setCompareBaseRef,
      setForkPushWarning,
      setPushTarget
    })
  } else {
    setBranchNameOverride(undefined)
    setBranchNameOverridePreservesNameEdits(false)
  }
  branchAutoNameRef.current = ''
  setStartFromResetHint(null)
  return resolution
}

function createStartPointResolution(
  item: GitHubWorkItem,
  startPoint: GitHubPrStartPoint
): SmartGitHubSubmitResolution & {
  kind: 'pr-start-point'
  baseBranch: string
  compareBaseRef?: string
  pushTarget?: GitPushTarget
  branchNameOverride?: string
} {
  return {
    ...getSmartGitHubSubmitResolution(item),
    kind: 'pr-start-point',
    baseBranch: startPoint.baseBranch,
    ...(startPoint.compareBaseRef ? { compareBaseRef: startPoint.compareBaseRef } : {}),
    ...(startPoint.pushTarget ? { pushTarget: startPoint.pushTarget } : {}),
    ...(startPoint.branchNameOverride ? { branchNameOverride: startPoint.branchNameOverride } : {})
  }
}

type StartPointSetters = Pick<
  ResolveSmartGitHubSubmitOptions,
  | 'setBaseBranch'
  | 'setBranchNameOverride'
  | 'setBranchNameOverridePreservesNameEdits'
  | 'setCompareBaseRef'
  | 'setForkPushWarning'
  | 'setPushTarget'
>

function applyStartPoint(startPoint: GitHubPrStartPoint, setters: StartPointSetters): void {
  setters.setBaseBranch(startPoint.baseBranch)
  setters.setCompareBaseRef(startPoint.compareBaseRef)
  setters.setPushTarget(startPoint.pushTarget)
  setters.setBranchNameOverride(startPoint.branchNameOverride)
  setters.setBranchNameOverridePreservesNameEdits(Boolean(startPoint.branchNameOverride))
  setters.setForkPushWarning(getForkPushWarning(startPoint))
}

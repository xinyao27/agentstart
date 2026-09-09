import type { GitPushTarget } from '@yiru/protocol/git/worktree-source'
import { getLinkedWorkItemWorkspaceName } from '~renderer/new-workspace/naming/name'
import type { SmartWorkspaceNameSelection } from '~renderer/new-workspace/smart-workspace-name-field'
import type { SmartNameMode } from '~renderer/new-workspace/smart-workspace-source-results'

import { resolveComposerBranchNameOverrideForCreate } from './composer-branch-selection'
import {
  isExplicitWorkspaceNameInput,
  resolveBlankBranchCreateNames,
  resolveSmartGitHubCreateNames
} from './composer-initial-state'
import type { PendingSmartGitHubSubmitResolution } from './resolve-smart-github-submit'
import type { LinkedWorkItemSummary } from './workspace-creation'

type ResolveComposerCreateOptions = {
  baseBranch: string | undefined
  branchAutoName: string
  branchNameOverride: string | undefined
  branchNameOverridePreservesNameEdits: boolean
  compareBaseRef: string | undefined
  effectiveLinkedPR: number | null
  fallbackWorkspaceName: string
  lastAutoName: string
  linkedWorkItem: LinkedWorkItemSummary | null
  name: string
  pushTarget: GitPushTarget | undefined
  smartGitHubResolution: PendingSmartGitHubSubmitResolution
  smartNameMode: SmartNameMode
  smartNameSelection: SmartWorkspaceNameSelection | null
  workspaceNameSeed: string
}

export type ComposerCreateResolution = {
  baseBranch: string | undefined
  branchNameOverride: string | undefined
  compareBaseRef: string | undefined
  displayName: string | undefined
  linkedPR: number | undefined
  linkedWorkItem: LinkedWorkItemSummary | null
  pushTarget: GitPushTarget | undefined
  workspaceName: string
}

export function resolveComposerCreate(
  options: ResolveComposerCreateOptions
): ComposerCreateResolution | null {
  const smart = options.smartGitHubResolution
  const linkedWorkItem = smart.kind === 'none' ? options.linkedWorkItem : smart.linkedWorkItem
  const linkedPR = smart.kind === 'none' ? options.effectiveLinkedPR : smart.linkedPR
  const titleName = linkedWorkItem ? getLinkedWorkItemWorkspaceName(linkedWorkItem) : null
  const nameIsAutoManaged = !isExplicitWorkspaceNameInput({
    name: options.name,
    lastAutoName: options.lastAutoName
  })
  const smartCreateNames =
    smart.kind === 'none'
      ? { workspaceName: options.workspaceNameSeed, displayName: undefined }
      : resolveSmartGitHubCreateNames({
          resolutionKind: smart.kind,
          smartWorkspaceName: smart.workspaceName,
          smartDisplayName: smart.displayName,
          fallbackWorkspaceName: options.workspaceNameSeed,
          nameIsAutoManaged
        })
  const workspaceName =
    smart.kind === 'none'
      ? nameIsAutoManaged && titleName
        ? titleName.seedName
        : options.workspaceNameSeed
      : smartCreateNames.workspaceName
  if (!workspaceName) {
    return null
  }
  const baseBranch =
    smart.kind === 'pr-start-point'
      ? smart.baseBranch
      : smart.kind === 'metadata-only' && options.effectiveLinkedPR !== null
        ? undefined
        : options.baseBranch
  const compareBaseRef =
    smart.kind === 'pr-start-point'
      ? smart.compareBaseRef
      : smart.kind === 'none'
        ? options.compareBaseRef
        : undefined
  const pushTarget =
    smart.kind === 'pr-start-point'
      ? smart.pushTarget
      : smart.kind === 'none'
        ? options.pushTarget
        : undefined
  const selectedBranchNameOverride =
    smart.kind === 'pr-start-point'
      ? smart.branchNameOverride
      : smart.kind === 'none'
        ? options.branchNameOverride
        : undefined
  const branchNameOverride = resolveComposerBranchNameOverrideForCreate({
    branchNameOverride: selectedBranchNameOverride,
    branchAutoName: options.branchAutoName,
    workspaceName,
    preserveWorkspaceNameEdits:
      smart.kind === 'pr-start-point' || options.branchNameOverridePreservesNameEdits,
    createBranchFromWorkspaceName: smart.kind === 'none' && options.smartNameMode === 'branches'
  })
  const names = resolveBlankBranchCreateNames({
    workspaceName,
    displayName:
      smart.kind === 'none'
        ? nameIsAutoManaged
          ? titleName?.displayName
          : undefined
        : smartCreateNames.displayName,
    fallbackWorkspaceName: options.fallbackWorkspaceName,
    enteredWorkspaceName: options.name,
    nameIsAutoManaged,
    branchNameOverride,
    branchNameFieldVisible:
      smart.kind === 'none' &&
      (!options.smartNameSelection || options.smartNameSelection.kind === 'branch')
  })
  return {
    baseBranch,
    branchNameOverride,
    compareBaseRef,
    displayName: names.displayName,
    linkedPR: linkedPR ?? undefined,
    linkedWorkItem,
    pushTarget,
    workspaceName: names.workspaceName
  }
}

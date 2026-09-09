import type { RepoHookSettingsValue as RepoHookSettings } from '@yiru/protocol'
import { normalizeExecutionHostId, type ExecutionHostId } from '@yiru/protocol/host/identity'
import type { ProjectSourceContext } from '@yiru/protocol/project/source-context'
import type { SetupAgentStartupPolicy } from '@yiru/protocol/worktree/hooks'
import { getDefaultRepoHookSettings } from '@yiru/protocol/worktree/hooks'
import {
  getLinkedWorkItemSuggestedName,
  getLinkedWorkItemWorkspaceName
} from '~renderer/new-workspace/naming/name'
import { isWorkItemLookupText } from '~renderer/sidebar/work-item-lookup-text'

import type { LinkedWorkItemSummary } from './workspace-creation'

export type InitialWorkspaceRunSeedInput = {
  draftProjectId?: string | null
  draftHostId?: string | null
  draftProjectHostSetupId?: string | null
  initialProjectSourceContext?: Pick<
    ProjectSourceContext,
    'projectId' | 'hostId' | 'projectHostSetupId'
  > | null
}

export function getRepoSetupAgentStartupPolicy(repo?: {
  hookSettings?: Pick<RepoHookSettings, 'setupAgentStartupPolicy'>
}): SetupAgentStartupPolicy {
  return repo?.hookSettings?.setupAgentStartupPolicy ?? 'start-immediately'
}

export function buildSetupAgentStartupHookSettings(
  current: RepoHookSettings | undefined,
  setupAgentStartupPolicy: SetupAgentStartupPolicy
): RepoHookSettings {
  const defaults = getDefaultRepoHookSettings()
  return {
    ...defaults,
    ...current,
    setupRunPolicy: current?.setupRunPolicy ?? defaults.setupRunPolicy,
    setupAgentStartupPolicy,
    commandSourcePolicy: current?.commandSourcePolicy ?? defaults.commandSourcePolicy,
    scripts: {
      ...defaults.scripts,
      ...current?.scripts
    }
  }
}

export function resolveInitialWorkspaceRunSeed({
  draftProjectId,
  draftHostId,
  draftProjectHostSetupId,
  initialProjectSourceContext
}: InitialWorkspaceRunSeedInput): {
  projectId: string | null
  hostId: ExecutionHostId | null
  projectHostSetupId: string | null
} {
  return {
    projectId: draftProjectId ?? initialProjectSourceContext?.projectId ?? null,
    hostId: normalizeExecutionHostId(draftHostId ?? initialProjectSourceContext?.hostId),
    projectHostSetupId:
      draftProjectHostSetupId ?? initialProjectSourceContext?.projectHostSetupId ?? null
  }
}

export function isExplicitWorkspaceNameInput({
  name,
  lastAutoName
}: {
  name: string
  lastAutoName: string
}): boolean {
  return Boolean(name.trim()) && name !== lastAutoName && !isWorkItemLookupText(name)
}

export function resolveBlankBranchCreateNames({
  workspaceName,
  displayName,
  fallbackWorkspaceName,
  enteredWorkspaceName,
  nameIsAutoManaged,
  branchNameOverride,
  branchNameFieldVisible
}: {
  workspaceName: string
  displayName: string | undefined
  fallbackWorkspaceName: string
  enteredWorkspaceName: string
  nameIsAutoManaged: boolean
  branchNameOverride: string | undefined
  branchNameFieldVisible: boolean
}): { workspaceName: string; displayName: string | undefined } {
  if (!branchNameFieldVisible || branchNameOverride?.trim()) {
    return { workspaceName, displayName }
  }
  return {
    workspaceName: fallbackWorkspaceName,
    displayName:
      displayName ?? (!nameIsAutoManaged ? enteredWorkspaceName.trim() || undefined : undefined)
  }
}

export function resolveSmartGitHubCreateNames({
  resolutionKind,
  smartWorkspaceName,
  smartDisplayName,
  fallbackWorkspaceName,
  nameIsAutoManaged
}: {
  resolutionKind: 'metadata-only' | 'pr-start-point'
  smartWorkspaceName: string
  smartDisplayName: string
  fallbackWorkspaceName: string
  nameIsAutoManaged: boolean
}): { workspaceName: string; displayName: string | undefined } {
  if (resolutionKind === 'pr-start-point' && !nameIsAutoManaged && fallbackWorkspaceName) {
    return { workspaceName: fallbackWorkspaceName, displayName: undefined }
  }
  return { workspaceName: smartWorkspaceName, displayName: smartDisplayName }
}

function getLinkedWorkItemSeedName(item: LinkedWorkItemSummary | null | undefined): string {
  if (!item) {
    return ''
  }
  return getLinkedWorkItemWorkspaceName(item)?.seedName ?? getLinkedWorkItemSuggestedName(item)
}

export function normalizeGitHubLinkedWorkItem(
  item: LinkedWorkItemSummary | null | undefined
): LinkedWorkItemSummary | null {
  return item ?? null
}

export function getInitialAutoManagedWorkspaceName({
  draftName,
  draftLinkedWorkItem,
  initialName,
  initialLinkedWorkItem
}: {
  draftName?: string | null
  draftLinkedWorkItem?: LinkedWorkItemSummary | null
  initialName: string
  initialLinkedWorkItem?: LinkedWorkItemSummary | null
}): string {
  const candidateName = draftName ?? initialName
  const seedName = getLinkedWorkItemSeedName(draftLinkedWorkItem ?? initialLinkedWorkItem)
  return candidateName && seedName && candidateName === seedName ? candidateName : ''
}

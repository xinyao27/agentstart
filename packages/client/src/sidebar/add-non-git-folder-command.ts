import type { Repo } from '@yiru/protocol/project/repository'
import { buildDismissedOnboardingFolderAgentStartup } from '~renderer/onboarding/folder-agent-startup'
import { readProjectCatalogSnapshot } from '~renderer/project-catalog/catalog-snapshot'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import type { AppState } from '~renderer/store/types'
import { activateAndRevealKnownWorktree } from '~renderer/worktree/activation'
import { refreshWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

import { markOnboardingProjectAdded } from './onboarding-project-checklist'

export async function addNonGitFolderAndActivate(
  getState: () => AppState,
  path: string,
  options?: { runtimeEnvironmentId?: string | null }
): Promise<Repo | null> {
  const hadProjectBeforeAdd = readProjectCatalogSnapshot().repos.length > 0
  const repo = await getState().registerNonGitFolder(path, options)
  if (!repo) {
    return null
  }

  await markOnboardingProjectAdded('addedFolder')
  const target = getActiveRuntimeTarget(getState().settings)
  const folderWorktree = (await refreshWorktreeCatalog(target, repo.id))?.worktrees[0]
  if (!folderWorktree) {
    return repo
  }

  const onboarding = await shellClient.onboarding.get().catch(() => null)
  const startup = buildDismissedOnboardingFolderAgentStartup(
    getState().settings,
    onboarding,
    hadProjectBeforeAdd
  )
  activateAndRevealKnownWorktree(folderWorktree, {
    sidebarRevealBehavior: 'auto',
    ...(startup ? { startup } : {})
  })
  return repo
}

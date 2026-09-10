import type { AddRepoExistingWorkspaceSource } from '@agentstart/protocol/telemetry/events/foundations'
import { useRef } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { track } from '~renderer/telemetry/client'

import {
  buildAddRepoExistingWorkspacesTelemetry,
  shouldTrackAddRepoExistingWorkspacesDetected
} from './add-repo/existing-workspaces-telemetry'
import { useProjectDefaultCheckoutHandoff } from './project-added-default-checkout'

type CompleteGitRepoAddOptions = {
  closeModal: () => void
  setHideDefaultBranchWorkspace: (hide: boolean) => void
}

export function useCompleteGitRepoAdd({
  closeModal,
  setHideDefaultBranchWorkspace
}: CompleteGitRepoAddOptions): (
  repoId: string,
  source: AddRepoExistingWorkspaceSource
) => Promise<void> {
  const detectedTelemetryTrackedRef = useRef<Set<string>>(new Set())
  const catalog = useProjectCatalog()
  const { worktreesByRepo } = projectCatalogRepoBuckets(catalog)
  const { finishProjectAddWithDefaultCheckout } = useProjectDefaultCheckoutHandoff()

  return async (repoId: string, source: AddRepoExistingWorkspaceSource): Promise<void> => {
    const worktrees = worktreesByRepo[repoId] ?? []
    const sortedWorktrees = [...worktrees].sort((a, b) => {
      if (a.lastActivityAt !== b.lastActivityAt) {
        return b.lastActivityAt - a.lastActivityAt
      }
      return a.displayName.localeCompare(b.displayName)
    })
    const existingWorkspaceTelemetry = buildAddRepoExistingWorkspacesTelemetry(
      source,
      sortedWorktrees
    )
    if (
      existingWorkspaceTelemetry &&
      shouldTrackAddRepoExistingWorkspacesDetected(existingWorkspaceTelemetry) &&
      !detectedTelemetryTrackedRef.current.has(repoId)
    ) {
      detectedTelemetryTrackedRef.current.add(repoId)
      track('add_repo_existing_workspaces_detected', existingWorkspaceTelemetry)
    }
    await finishProjectAddWithDefaultCheckout({
      project: repoId,
      source,
      closeModal,
      setHideDefaultBranchWorkspace
    })
  }
}

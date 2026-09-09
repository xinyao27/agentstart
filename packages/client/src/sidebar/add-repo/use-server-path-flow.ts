import type { NestedRepoScanResult } from '@yiru/protocol/project/group-model'
import type { Repo } from '@yiru/protocol/project/repository'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import type { AddRepoExistingWorkspaceSource } from '@yiru/protocol/telemetry/events/foundations'
import {
  buildNestedRepoScanTelemetry,
  createNestedRepoTelemetryAttemptId,
  type NestedRepoTelemetryRuntimeKind
} from '@yiru/protocol/telemetry/nested-repo'
import type { Dispatch, SetStateAction } from 'react'
import { useRef, useState } from 'react'
import { projectCatalogTargetForRepo } from '~renderer/project-catalog/query'
import { track } from '~renderer/telemetry/client'
import { refreshWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

import { markOnboardingProjectAdded } from '../onboarding-project-checklist'
import { createNestedRepoScanId } from './dialog-types'

type ShowNestedRepoReview = (args: {
  scan: NestedRepoScanResult
  selectedPath: string
  attemptId: string
  runtimeKind: NestedRepoTelemetryRuntimeKind
  inProgress: boolean
  scanId: string | null
}) => void

export function useAddRepoServerPathFlow({
  addRepoPath,
  closeModal,
  getNestedRepoRuntimeKind,
  scanNestedRepos,
  setActiveNestedScanId,
  setNestedScanInProgress,
  showNestedRepoReview,
  onGitRepoReady,
  setAddProjectBusyLabel
}: {
  addRepoPath: (path: string, kind?: 'git' | 'folder') => Promise<Repo | null>
  closeModal: () => void
  getNestedRepoRuntimeKind: () => NestedRepoTelemetryRuntimeKind
  scanNestedRepos: (
    path: string,
    controls?: { scanId?: string; onProgress?: (scan: NestedRepoScanResult) => void }
  ) => Promise<NestedRepoScanResult | null>
  setActiveNestedScanId: (scanId: string | null) => void
  setNestedScanInProgress: (inProgress: boolean) => void
  showNestedRepoReview: ShowNestedRepoReview
  onGitRepoReady: (repoId: string, source: AddRepoExistingWorkspaceSource) => Promise<void>
  setAddProjectBusyLabel: (label: string | null) => void
}): {
  serverPath: string
  isAddingServerPath: boolean
  setServerPath: Dispatch<SetStateAction<string>>
  resetServerPathFlow: () => void
  handleAddServerPath: (kind: 'git' | 'folder') => Promise<void>
} {
  const [serverPath, setServerPath] = useState('')
  const [isAddingServerPath, setIsAddingServerPath] = useState(false)
  const serverAddGenRef = useRef(0)

  const resetServerPathFlow = (): void => {
    serverAddGenRef.current++
    setServerPath('')
    setIsAddingServerPath(false)
  }

  const handleAddServerPath = async (kind: 'git' | 'folder'): Promise<void> => {
    const path = serverPath.trim()
    if (!path) {
      return
    }
    const gen = ++serverAddGenRef.current
    setIsAddingServerPath(true)
    setAddProjectBusyLabel(kind === 'git' ? 'Scanning for repositories...' : 'Opening folder...')
    try {
      if (kind === 'git') {
        const attemptId = createNestedRepoTelemetryAttemptId()
        const runtimeKind = getNestedRepoRuntimeKind()
        const supportsStreamingScan = runtimeKind !== 'runtime'
        const scanId = supportsStreamingScan ? createNestedRepoScanId() : null
        if (scanId) {
          setActiveNestedScanId(scanId)
          setNestedScanInProgress(true)
        }
        const scan = await scanNestedRepos(
          path,
          scanId
            ? {
                scanId,
                onProgress: (progressScan) => {
                  if (
                    gen !== serverAddGenRef.current ||
                    progressScan.selectedPathKind !== 'non_git_folder' ||
                    progressScan.repos.length === 0
                  ) {
                    return
                  }
                  showNestedRepoReview({
                    scan: progressScan,
                    selectedPath: path,
                    attemptId,
                    runtimeKind,
                    inProgress: true,
                    scanId
                  })
                }
              }
            : undefined
        )
        if (gen !== serverAddGenRef.current) {
          return
        }
        setNestedScanInProgress(false)
        setActiveNestedScanId(null)
        track(
          'add_repo_nested_scan_result',
          buildNestedRepoScanTelemetry({
            attemptId,
            surface: 'sidebar',
            runtimeKind,
            scan
          })
        )
        if (scan?.selectedPathKind === 'non_git_folder' && scan.repos.length > 0) {
          showNestedRepoReview({
            scan,
            selectedPath: path,
            attemptId,
            runtimeKind,
            inProgress: false,
            scanId
          })
          return
        }
      }
      setAddProjectBusyLabel(kind === 'git' ? 'Opening project...' : 'Opening folder...')
      const repo = await addRepoPath(path, kind)
      if (gen !== serverAddGenRef.current) {
        return
      }
      if (repo && isGitRepoKind(repo)) {
        // Why: once the repo exists, a transient non-authoritative refresh
        // should fall through to project reveal instead of leaving the add flow open.
        await refreshWorktreeCatalog(projectCatalogTargetForRepo(repo), repo.id)
        if (gen !== serverAddGenRef.current) {
          return
        }
        await onGitRepoReady(repo.id, 'runtime_server_path')
      } else if (repo) {
        // Why: folder repos skip the Git default-checkout handoff; their synthetic
        // root workspace is opened by the folder add flow.
        await markOnboardingProjectAdded('addedFolder')
        closeModal()
      }
    } finally {
      if (gen === serverAddGenRef.current) {
        setNestedScanInProgress(false)
        setActiveNestedScanId(null)
        setIsAddingServerPath(false)
        setAddProjectBusyLabel(null)
      }
    }
  }

  return { serverPath, isAddingServerPath, setServerPath, resetServerPathFlow, handleAddServerPath }
}

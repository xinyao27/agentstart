import type { Repo } from '@agentstart/protocol/project/repository'
import type { AddRepoExistingWorkspaceSource } from '@agentstart/protocol/telemetry/events/foundations'
import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { readProjectCatalogMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import { projectCatalogTargetForRepo } from '~renderer/project-catalog/query'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import { requireRepoProtocolClient } from '~renderer/runtime/repo-catalog-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { useAppStore } from '~renderer/store/state'
import { refreshWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

import { getCloneDestinationAutoFill } from '../clone-defaults'
import type { AddRepoDialogStep } from './dialog-types'

export function useAddRepoCloneFlow({
  step,
  activeRuntimeEnvironmentId,
  workspaceDir,
  onGitRepoReady
}: {
  step: AddRepoDialogStep
  activeRuntimeEnvironmentId: string | null | undefined
  workspaceDir: string | null | undefined
  onGitRepoReady: (repoId: string, source: AddRepoExistingWorkspaceSource) => Promise<void>
}): {
  cloneUrl: string
  cloneDestination: string
  cloneError: string | null
  cloneProgress: { phase: string; percent: number } | null
  isCloning: boolean
  setCloneUrl: Dispatch<SetStateAction<string>>
  setCloneDestination: Dispatch<SetStateAction<string>>
  setCloneError: Dispatch<SetStateAction<string | null>>
  resetCloneFlow: () => void
  handlePickDestination: () => Promise<void>
  handleClone: () => Promise<void>
} {
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneDestination, setCloneDestinationState] = useState('')
  const [isCloneDestinationTouched, setIsCloneDestinationTouched] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [cloneProgress, setCloneProgress] = useState<{ phase: string; percent: number } | null>(
    null
  )
  const hostToken = activeRuntimeEnvironmentId?.trim() ?? ''
  const hostTokenRef = useRef(hostToken)
  useLayoutEffect(() => {
    hostTokenRef.current = hostToken
  }, [hostToken])
  // Why: monotonic ID so stale clone callbacks can detect they were superseded.
  const cloneGenRef = useRef(0)
  // Why: track whether we've already auto-filled for this entry into the clone step,
  // so a late settings hydration still gets a chance to set the default.

  useEffect(() => {
    if (!isCloning) {
      return
    }
    return workspaceHostClient.repos.onCloneProgress(setCloneProgress)
  }, [isCloning])

  const cloneDestinationAutoFill = getCloneDestinationAutoFill({
    step,
    cloneDestination,
    activeRuntimeEnvironmentId,
    workspaceDir,
    cloneStepAutoFilled: isCloneDestinationTouched
  })
  const effectiveCloneDestination = cloneDestinationAutoFill?.destination ?? cloneDestination

  const setCloneDestination: Dispatch<SetStateAction<string>> = (value) => {
    setIsCloneDestinationTouched(true)
    setCloneDestinationState(value)
  }

  const resetCloneFlow = (): void => {
    cloneGenRef.current++
    setCloneUrl('')
    setCloneDestinationState('')
    setIsCloneDestinationTouched(false)
    setIsCloning(false)
    setCloneError(null)
    setCloneProgress(null)
  }

  const handlePickDestination = async (): Promise<void> => {
    if (activeRuntimeEnvironmentId?.trim()) {
      // Why: the native folder picker returns a client-local path. Runtime
      // clone destinations must be typed as paths on that host.
      toast.error(
        translate(
          'auto.components.sidebar.useAddRepoCloneFlow.0dc4d1b657',
          'Enter a host path for the clone destination.'
        )
      )
      return
    }
    const gen = cloneGenRef.current
    const dir = await workspaceHostClient.repos.pickDirectory()
    if (dir && gen === cloneGenRef.current) {
      setCloneDestinationState(dir)
      setIsCloneDestinationTouched(true)
      setCloneError(null)
    }
  }

  const handleClone = async (): Promise<void> => {
    const trimmedUrl = cloneUrl.trim()
    if (!trimmedUrl || !effectiveCloneDestination.trim()) {
      return
    }
    const requestHostToken = hostToken
    const gen = ++cloneGenRef.current
    setIsCloning(true)
    setCloneError(null)
    setCloneProgress(null)
    try {
      const target = activeRuntimeEnvironmentId?.trim()
        ? { kind: 'environment' as const, environmentId: activeRuntimeEnvironmentId.trim() }
        : getActiveRuntimeTarget({
            ...useAppStore.getState().settings,
            activeRuntimeEnvironmentId: null
          })
      const expectedRevision = readProjectCatalogMutationRevision(target)
      const cloneResult =
        target.kind === 'environment'
          ? await (
              await requireRepoProtocolClient(target)
            ).clone(
              {
                expectedRevision,
                url: trimmedUrl,
                destination: effectiveCloneDestination.trim()
              },
              { timeoutMs: 10 * 60_000 }
            )
          : await workspaceHostClient.repos.clone({
              expectedRevision,
              url: trimmedUrl,
              destination: effectiveCloneDestination.trim()
            })
      await refreshAfterProjectCatalogMutation(target, cloneResult.revision)
      const repo = cloneResult.repo satisfies Repo
      if (gen !== cloneGenRef.current || requestHostToken !== hostTokenRef.current) {
        return
      }
      toast.success(
        translate('auto.components.sidebar.useAddRepoCloneFlow.4d0013cc93', 'Repository cloned'),
        { description: repo.displayName }
      )
      // Why: once the repo exists, a transient non-authoritative refresh
      // should fall through to project reveal instead of leaving the add flow open.
      await refreshWorktreeCatalog(projectCatalogTargetForRepo(repo), repo.id)
      if (gen !== cloneGenRef.current || requestHostToken !== hostTokenRef.current) {
        return
      }
      await onGitRepoReady(repo.id, 'clone_url')
    } catch (err) {
      if (gen !== cloneGenRef.current || requestHostToken !== hostTokenRef.current) {
        return
      }
      const message = extractRuntimeErrorMessage(err, String(err))
      setCloneError(message)
    } finally {
      if (gen === cloneGenRef.current && requestHostToken === hostTokenRef.current) {
        setIsCloning(false)
      }
    }
  }

  return {
    cloneUrl,
    cloneDestination: effectiveCloneDestination,
    cloneError,
    cloneProgress,
    isCloning,
    setCloneUrl,
    setCloneDestination,
    setCloneError,
    resetCloneFlow,
    handlePickDestination,
    handleClone
  }
}

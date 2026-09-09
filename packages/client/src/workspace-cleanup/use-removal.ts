import type { WorkspaceCleanupCandidate } from '@yiru/protocol'
import { useRef, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { useAppStore } from '~renderer/store/state'

import {
  startWorkspaceCleanupBackgroundRemoval,
  type WorkspaceCleanupRemovalProgress
} from './background-removal'
import { filterWorkspaceCleanupRemovalCandidates } from './removal-candidates'

type UseWorkspaceCleanupRemovalOptions = {
  loading: boolean
  onSelectOnly: (worktreeId: string) => void
  onRemoved: (worktreeIds: readonly string[]) => void
  onClose: () => void
}

type WorkspaceCleanupRemoval = {
  confirming: boolean
  confirmCandidates: WorkspaceCleanupCandidate[]
  progress: WorkspaceCleanupRemovalProgress | null
  rowFailures: Record<string, string>
  isInFlight: () => boolean
  resetForOpen: () => void
  resetForScan: () => void
  openConfirmation: (candidates: readonly WorkspaceCleanupCandidate[]) => void
  removeRow: (candidate: WorkspaceCleanupCandidate) => void
  cancel: () => void
  confirm: () => void
}

export function useWorkspaceCleanupRemoval({
  loading,
  onSelectOnly,
  onRemoved,
  onClose
}: UseWorkspaceCleanupRemovalOptions): WorkspaceCleanupRemoval {
  const removeCandidates = useAppStore((state) => state.removeWorkspaceCleanupCandidates)
  const markQueued = useAppStore((state) => state.markWorktreesQueuedForDeletion)
  const clearDeleteState = useAppStore((state) => state.clearWorktreeDeleteState)
  const [confirming, setConfirming] = useState(false)
  const [confirmCandidates, setConfirmCandidates] = useState<WorkspaceCleanupCandidate[]>([])
  const [progress, setProgress] = useState<WorkspaceCleanupRemovalProgress | null>(null)
  const [rowFailures, setRowFailures] = useState<Record<string, string>>({})
  const inFlightRef = useRef(false)
  // Why: late settlements from an earlier batch must not mutate a newer batch.
  const batchIdRef = useRef(0)
  const mountedRef = useMountedRef()

  const clearQueuedDeleteState = (worktreeId: string): void => {
    const deleteState = useAppStore.getState().deleteStateByWorktreeId[worktreeId]
    if (deleteState?.isDeleting && deleteState.error === null && deleteState.phase === 'queued') {
      clearDeleteState(worktreeId)
    }
  }

  const resetForOpen = useEventCallback((): void => {
    if (inFlightRef.current) {
      return
    }
    setConfirming(false)
    setRowFailures({})
  })

  const resetForScan = useEventCallback((): void => {
    if (inFlightRef.current) {
      return
    }
    setConfirming(false)
    setRowFailures({})
  })

  const openConfirmation = useEventCallback(
    (candidates: readonly WorkspaceCleanupCandidate[]): void => {
      const nextCandidates = filterWorkspaceCleanupRemovalCandidates(
        candidates,
        useAppStore.getState().deleteStateByWorktreeId
      )
      if (nextCandidates.length === 0) {
        return
      }
      setConfirmCandidates(nextCandidates)
      setConfirming(true)
    }
  )

  const removeRow = useEventCallback((candidate: WorkspaceCleanupCandidate): void => {
    if (loading) {
      return
    }
    onSelectOnly(candidate.worktreeId)
    openConfirmation([candidate])
  })

  const cancel = useEventCallback((): void => {
    if (progress) {
      onClose()
      return
    }
    setConfirming(false)
    setConfirmCandidates([])
  })

  const finish = (): void => {
    setProgress(null)
    setConfirming(false)
    setConfirmCandidates([])
    inFlightRef.current = false
  }

  const confirm = useEventCallback((): void => {
    if (confirmCandidates.length === 0 || inFlightRef.current) {
      return
    }
    const removableCandidates = filterWorkspaceCleanupRemovalCandidates(
      confirmCandidates,
      useAppStore.getState().deleteStateByWorktreeId
    )
    if (removableCandidates.length === 0) {
      setConfirming(false)
      setConfirmCandidates([])
      return
    }
    inFlightRef.current = true
    batchIdRef.current += 1
    const batchId = batchIdRef.current
    // Why: a hung settlement must not retain full candidate objects for the renderer lifetime.
    const worktreeIds = removableCandidates.map((candidate) => candidate.worktreeId)
    setRowFailures({})
    markQueued(worktreeIds)
    startWorkspaceCleanupBackgroundRemoval({
      candidates: removableCandidates,
      removeCandidates,
      onProgress: (nextProgress) => {
        if (mountedRef.current) {
          setProgress(nextProgress)
        }
      },
      onRowFailed: (failure) => clearQueuedDeleteState(failure.worktreeId),
      onResult: (result) => {
        const failures: Record<string, string> = {}
        for (const failure of result.failures) {
          failures[failure.worktreeId] = failure.message
          clearQueuedDeleteState(failure.worktreeId)
        }
        if (mountedRef.current) {
          setRowFailures(failures)
          onRemoved(result.removedIds)
          finish()
        } else {
          inFlightRef.current = false
        }
      },
      onLateResult: (result) => {
        for (const failure of result.failures) {
          clearQueuedDeleteState(failure.worktreeId)
        }
        if (!mountedRef.current || batchIdRef.current !== batchId) {
          return
        }
        setRowFailures((current) => {
          const next = { ...current }
          for (const id of result.removedIds) {
            delete next[id]
          }
          for (const failure of result.failures) {
            next[failure.worktreeId] = failure.message
          }
          return next
        })
        onRemoved(result.removedIds)
      },
      onError: () => {
        for (const worktreeId of worktreeIds) {
          clearQueuedDeleteState(worktreeId)
        }
        if (mountedRef.current) {
          finish()
        } else {
          inFlightRef.current = false
        }
      }
    })
  })

  return {
    confirming,
    confirmCandidates,
    progress,
    rowFailures,
    isInFlight: () => inFlightRef.current,
    resetForOpen,
    resetForScan,
    openConfirmation,
    removeRow,
    cancel,
    confirm
  }
}

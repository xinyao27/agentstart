import type { NestedRepoScanResult } from '@yiru/protocol/project/group-model'
import type { NestedRepoTelemetryRuntimeKind } from '@yiru/protocol/telemetry/nested-repo'
import type { Dispatch, SetStateAction } from 'react'
import { useRef, useState } from 'react'

import { defaultProjectGroupNameForPath, type AddRepoDialogStep } from './dialog-types'

type ShowNestedRepoReviewArgs = {
  scan: NestedRepoScanResult
  selectedPath: string
  attemptId: string
  runtimeKind: NestedRepoTelemetryRuntimeKind
  inProgress: boolean
  scanId: string | null
}

export function useAddRepoNestedReviewState({
  activeRuntimeEnvironmentId,
  cancelNestedRepoScan,
  setStep
}: {
  activeRuntimeEnvironmentId: string | null | undefined
  cancelNestedRepoScan: (scanId: string) => Promise<unknown>
  setStep: (step: AddRepoDialogStep) => void
}): {
  nestedScan: NestedRepoScanResult | null
  nestedSelectedPaths: Set<string>
  nestedGroupName: string
  nestedAttemptId: string | null
  nestedRuntimeKind: NestedRepoTelemetryRuntimeKind | null
  nestedScanInProgress: boolean
  nestedScanId: string | null
  nestedImportScanId: string | null
  setNestedSelectedPaths: Dispatch<SetStateAction<Set<string>>>
  setNestedGroupName: Dispatch<SetStateAction<string>>
  setNestedScanInProgress: Dispatch<SetStateAction<boolean>>
  getNestedRepoRuntimeKind: () => NestedRepoTelemetryRuntimeKind
  showNestedRepoReview: (args: ShowNestedRepoReviewArgs) => void
  setActiveNestedScanId: (scanId: string | null) => void
  handleStopNestedScan: () => void
  resetNestedRepoReviewState: () => void
} {
  const [nestedScan, setNestedScan] = useState<NestedRepoScanResult | null>(null)
  const [nestedSelectedPaths, setNestedSelectedPaths] = useState<Set<string>>(new Set())
  const [nestedGroupName, setNestedGroupName] = useState('')
  const [nestedAttemptId, setNestedAttemptId] = useState<string | null>(null)
  const [nestedRuntimeKind, setNestedRuntimeKind] = useState<NestedRepoTelemetryRuntimeKind | null>(
    null
  )
  const [nestedScanInProgress, setNestedScanInProgress] = useState(false)
  const [nestedScanId, setNestedScanId] = useState<string | null>(null)
  const [nestedImportScanId, setNestedImportScanId] = useState<string | null>(null)
  const nestedScanIdRef = useRef<string | null>(null)

  const getNestedRepoRuntimeKind = (): NestedRepoTelemetryRuntimeKind => {
    return activeRuntimeEnvironmentId?.trim() ? 'runtime' : 'local'
  }

  const showNestedRepoReview = (args: ShowNestedRepoReviewArgs): void => {
    setNestedScan(args.scan)
    setNestedSelectedPaths(new Set(args.scan.repos.map((repo) => repo.path)))
    setNestedGroupName(defaultProjectGroupNameForPath(args.scan.selectedPath || args.selectedPath))
    setNestedAttemptId(args.attemptId)
    setNestedRuntimeKind(args.runtimeKind)
    setNestedScanInProgress(args.inProgress)
    setNestedImportScanId(args.scanId)
    setStep('nested')
  }

  const setActiveNestedScanId = (scanId: string | null): void => {
    nestedScanIdRef.current = scanId
    setNestedScanId(scanId)
  }

  const handleStopNestedScan = () => {
    const scanId = nestedScanIdRef.current
    if (!scanId) {
      return
    }
    void cancelNestedRepoScan(scanId)
  }

  const resetNestedRepoReviewState = (): void => {
    const activeNestedScanId = nestedScanIdRef.current
    if (activeNestedScanId) {
      void cancelNestedRepoScan(activeNestedScanId)
    }
    setNestedScan(null)
    setNestedSelectedPaths(new Set())
    setNestedGroupName('')
    setNestedAttemptId(null)
    setNestedRuntimeKind(null)
    setNestedScanInProgress(false)
    setNestedImportScanId(null)
    setActiveNestedScanId(null)
  }

  return {
    nestedScan,
    nestedSelectedPaths,
    nestedGroupName,
    nestedAttemptId,
    nestedRuntimeKind,
    nestedScanInProgress,
    nestedScanId,
    nestedImportScanId,
    setNestedSelectedPaths,
    setNestedGroupName,
    setNestedScanInProgress,
    getNestedRepoRuntimeKind,
    showNestedRepoReview,
    setActiveNestedScanId,
    handleStopNestedScan,
    resetNestedRepoReviewState
  }
}

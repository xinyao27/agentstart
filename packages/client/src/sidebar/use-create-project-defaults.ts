// Default-driven create-project state for AddRepoDialog: resolves the default
// parent (local/runtime host home) and probes Git
// availability, guarding against stale async results when the target changes.
import { useEffect, useRef, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { requireRepoProtocolClient } from '~renderer/runtime/repo-catalog-target'
import { browseRuntimeServerDirectory } from '~renderer/runtime/server-directory-browser'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'

import type { AddRepoDialogStep } from './add-repo/dialog-types'
import { getDefaultCreateProjectParent, type GitAvailability } from './create-project-defaults'

const LOCAL_GIT_AVAILABILITY_TIMEOUT_MS = 1500
const RUNTIME_GIT_AVAILABILITY_TIMEOUT_MS = 3000

export type CreateRuntimeParentStatus = 'idle' | 'checking' | 'failed'

type AutoFilledCreateParent = {
  parent: string
  targetKey: string
}

type CreateParentProvenance = {
  parent: string
  targetKey: string
}

// Why: tagged by request identity (targetKey) rather than a free-floating
// status, so a stale response can never render as the currently selected host.
type GitProbeResult = {
  targetKey: string
  available: boolean | null
}

// Why: shared by both parent-resolution effects and the runtime status
// derivation so "resolved for this host" is judged identically everywhere.
function isCreateParentResolved(
  autoFilled: AutoFilledCreateParent | null,
  createParent: string,
  targetKey: string
): boolean {
  return autoFilled?.targetKey === targetKey && autoFilled.parent === createParent.trim()
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Timed out')), timeoutMs)
    promise.then(
      (value) => {
        if (timeout) {
          clearTimeout(timeout)
        }
        resolve(value)
      },
      (error) => {
        if (timeout) {
          clearTimeout(timeout)
        }
        reject(error)
      }
    )
  })
}

export function useCreateProjectDefaults({
  step,
  activeRuntimeEnvironmentId,
  createParent,
  setCreateParent
}: {
  step: AddRepoDialogStep
  activeRuntimeEnvironmentId: string | null | undefined
  createParent: string
  setCreateParent: (value: string) => void
}): {
  createDefaultParent: string
  createGitAvailability: GitAvailability
  createRuntimeParentStatus: CreateRuntimeParentStatus
  createParentDefaultPending: boolean
  resetCreateDefaultState: () => void
  markCreateParentTouched: (value?: string) => void
} {
  const [gitProbeResult, setGitProbeResult] = useState<GitProbeResult | null>(null)
  const [failedRuntimeParentKey, setFailedRuntimeParentKey] = useState<string | null>(null)
  const [autoFilledCreateParent, setAutoFilledCreateParent] =
    useState<AutoFilledCreateParent | null>(null)
  const [createParentProvenance, setCreateParentProvenance] =
    useState<CreateParentProvenance | null>(null)
  const [isCreateParentTouched, setIsCreateParentTouched] = useState(false)
  const createParentDefaultGenRef = useRef(0)
  const createGitProbeGenRef = useRef(0)
  const activeCreateParentRuntimeEnvironmentId = activeRuntimeEnvironmentId?.trim() || null
  const activeCreateParentTargetKey = activeCreateParentRuntimeEnvironmentId
    ? `runtime:${activeCreateParentRuntimeEnvironmentId}`
    : 'local'

  const canReplaceCreateParentDefault = useEventCallback((parent: string): boolean => {
    if (isCreateParentTouched) {
      return false
    }
    const trimmedParent = parent.trim()
    return !trimmedParent || autoFilledCreateParent?.parent === trimmedParent
  })

  const resetCreateDefaultState = () => {
    createParentDefaultGenRef.current++
    createGitProbeGenRef.current++
    setAutoFilledCreateParent(null)
    setCreateParentProvenance(null)
    setIsCreateParentTouched(false)
    setGitProbeResult(null)
    setFailedRuntimeParentKey(null)
  }

  // Why: a default must never clobber a parent the user picked themselves.
  const markCreateParentTouched = (value?: string) => {
    setAutoFilledCreateParent(null)
    setCreateParentProvenance({
      parent: (value ?? createParent).trim(),
      targetKey: activeCreateParentTargetKey
    })
    setIsCreateParentTouched(true)
  }

  const createParentDefaultPending =
    step === 'create' &&
    !isCreateParentTouched &&
    Boolean(createParent.trim()) &&
    autoFilledCreateParent?.parent === createParent.trim() &&
    autoFilledCreateParent?.targetKey !== activeCreateParentTargetKey
  const createParentTargetPending =
    step === 'create' &&
    Boolean(createParent.trim()) &&
    createParentProvenance?.parent === createParent.trim() &&
    createParentProvenance.targetKey !== activeCreateParentTargetKey
  const createParentPending = createParentDefaultPending || createParentTargetPending

  // Why: derived from the tagged resolution instead of a stored value, so a
  // default resolved for a previous host can never render while another is active.
  const createDefaultParent =
    autoFilledCreateParent && autoFilledCreateParent.targetKey === activeCreateParentTargetKey
      ? autoFilledCreateParent.parent
      : ''

  // Why: 'checking' is whatever hasn't resolved for the current host yet, not
  // a status the effect below has to set and clear by hand.
  const createGitAvailability: GitAvailability =
    gitProbeResult && gitProbeResult.targetKey === activeCreateParentTargetKey
      ? gitProbeResult.available === null
        ? 'unknown'
        : gitProbeResult.available
          ? 'available'
          : 'unavailable'
      : 'checking'

  // Why: same derivation strategy as createGitAvailability — 'idle' covers both
  // "not applicable" and "already resolved," 'checking' covers everything else
  // until a probe for this host either resolves or is tagged as failed.
  const createRuntimeParentStatus: CreateRuntimeParentStatus =
    !activeCreateParentRuntimeEnvironmentId ||
    !canReplaceCreateParentDefault(createParent) ||
    isCreateParentResolved(autoFilledCreateParent, createParent, activeCreateParentTargetKey)
      ? 'idle'
      : failedRuntimeParentKey === activeCreateParentTargetKey
        ? 'failed'
        : 'checking'

  useEffect(() => {
    if (step !== 'create') {
      return
    }
    if (activeCreateParentRuntimeEnvironmentId) {
      return
    }
    // Why: invalidate any in-flight runtime parent probe once local mode owns the default.
    const gen = ++createParentDefaultGenRef.current
    if (!canReplaceCreateParentDefault(createParent)) {
      return
    }
    if (
      createParent.trim() &&
      autoFilledCreateParent?.targetKey !== 'local' &&
      autoFilledCreateParent?.parent === createParent.trim()
    ) {
      setCreateParent('')
      return
    }
    if (isCreateParentResolved(autoFilledCreateParent, createParent, 'local')) {
      return
    }
    void workspaceHostClient.repos
      .getDefaultCreateProjectParent()
      .then((parent) => {
        if (
          gen !== createParentDefaultGenRef.current ||
          !canReplaceCreateParentDefault(createParent) ||
          !parent
        ) {
          return
        }
        setAutoFilledCreateParent({ parent, targetKey: 'local' })
        setCreateParentProvenance({ parent, targetKey: 'local' })
        setCreateParent(parent)
      })
      .catch(() => {
        // Keep the field empty if the local host cannot provide a submit-ready default.
      })
  }, [
    activeRuntimeEnvironmentId,
    activeCreateParentRuntimeEnvironmentId,
    autoFilledCreateParent,
    canReplaceCreateParentDefault,
    createParent,
    setCreateParent,
    step
  ])

  useEffect(() => {
    if (step !== 'create') {
      return
    }
    const runtimeEnvironmentId = activeCreateParentRuntimeEnvironmentId
    if (!runtimeEnvironmentId) {
      return
    }
    if (!canReplaceCreateParentDefault(createParent)) {
      return
    }
    const targetKey = `runtime:${runtimeEnvironmentId}`
    if (
      createParent.trim() &&
      autoFilledCreateParent?.targetKey !== targetKey &&
      autoFilledCreateParent?.parent === createParent.trim()
    ) {
      setCreateParent('')
      return
    }
    if (isCreateParentResolved(autoFilledCreateParent, createParent, targetKey)) {
      return
    }

    const gen = ++createParentDefaultGenRef.current
    void withTimeout(
      browseRuntimeServerDirectory(runtimeEnvironmentId, '~'),
      RUNTIME_GIT_AVAILABILITY_TIMEOUT_MS
    )
      .then((result) => {
        if (
          gen !== createParentDefaultGenRef.current ||
          !canReplaceCreateParentDefault(createParent)
        ) {
          return
        }
        const parent = getDefaultCreateProjectParent(result.resolvedPath)
        setAutoFilledCreateParent({ parent, targetKey })
        setCreateParentProvenance({ parent, targetKey })
        setCreateParent(parent)
        setFailedRuntimeParentKey(null)
      })
      .catch(() => {
        if (gen !== createParentDefaultGenRef.current) {
          return
        }
        setFailedRuntimeParentKey(targetKey)
      })
  }, [
    activeRuntimeEnvironmentId,
    activeCreateParentRuntimeEnvironmentId,
    autoFilledCreateParent,
    canReplaceCreateParentDefault,
    createParent,
    setCreateParent,
    step
  ])

  useEffect(() => {
    if (step !== 'create') {
      return
    }
    const gen = ++createGitProbeGenRef.current
    const runtimeEnvironmentId = activeCreateParentRuntimeEnvironmentId
    const targetKey = activeCreateParentTargetKey
    const probe = runtimeEnvironmentId
      ? requireRepoProtocolClient({
          kind: 'environment',
          environmentId: runtimeEnvironmentId
        }).then((client) => client.gitAvailable({ timeoutMs: RUNTIME_GIT_AVAILABILITY_TIMEOUT_MS }))
      : workspaceHostClient.repos.isGitAvailable()
    const timeoutMs = runtimeEnvironmentId
      ? RUNTIME_GIT_AVAILABILITY_TIMEOUT_MS
      : LOCAL_GIT_AVAILABILITY_TIMEOUT_MS

    void withTimeout(probe, timeoutMs)
      .then((available) => {
        if (gen !== createGitProbeGenRef.current) {
          return
        }
        setGitProbeResult({ targetKey, available })
      })
      .catch(() => {
        if (gen !== createGitProbeGenRef.current) {
          return
        }
        setGitProbeResult({ targetKey, available: null })
      })
  }, [activeCreateParentRuntimeEnvironmentId, activeCreateParentTargetKey, step])

  return {
    createDefaultParent,
    createGitAvailability,
    createRuntimeParentStatus,
    createParentDefaultPending: createParentPending,
    resetCreateDefaultState,
    markCreateParentTouched
  }
}

import {
  getSettingsFocusedExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import { useState } from 'react'
import { useAppStore } from '~renderer/store/state'

import { useSidebarHostScopeOptions } from '../use-sidebar-host-scope-options'
import type { AddRepoDialogStep } from './dialog-types'
import { canSelectAddRepoHost } from './host-availability'

export function useAddRepoHostSelection({
  isOpen,
  setStep
}: {
  isOpen: boolean
  setStep: (step: AddRepoDialogStep) => void
}): {
  hostOptions: ReturnType<typeof useSidebarHostScopeOptions>['hostOptions']
  selectedHostId: ExecutionHostId
  selectedParsedHost: ReturnType<typeof parseExecutionHostId>
  hostSelectorOpen: boolean
  setHostSelectorOpen: (open: boolean) => void
  handleSelectAddProjectHost: (hostId: ExecutionHostId) => Promise<void>
} {
  const settings = useAppStore((s) => s.settings)
  const switchRuntimeEnvironment = useAppStore((s) => s.switchRuntimeEnvironment)
  const { hostOptions } = useSidebarHostScopeOptions()
  const [selectedAddProjectHostId, setSelectedAddProjectHostId] =
    useState<ExecutionHostId>(LOCAL_EXECUTION_HOST_ID)
  const [hostSelectorOpen, setHostSelectorOpen] = useState(false)
  const [wasDialogOpen, setWasDialogOpen] = useState(isOpen)

  // Why: seed the preference to the settings-focused host on the dialog's open
  // edge via a render-time compare (React's "adjusting state while rendering"),
  // not an Effect — the setter here is a plain, idempotent state update, so
  // it's safe to run during render instead of deferred a frame after commit.
  if (isOpen !== wasDialogOpen) {
    setWasDialogOpen(isOpen)
    // Why: this hook outlives the dialog, so a selector the user left open must
    // not pop back open on the next launch — including on the paths that close
    // the dialog programmatically rather than through onOpenChange.
    setHostSelectorOpen(false)
    if (isOpen) {
      const focusedHostId = getSettingsFocusedExecutionHostId(settings)
      const nextHostId = hostOptions.some(
        (host) => host.id === focusedHostId && canSelectAddRepoHost(host)
      )
        ? focusedHostId
        : LOCAL_EXECUTION_HOST_ID
      setSelectedAddProjectHostId(nextHostId)
    }
  }

  const selectedHost =
    hostOptions.find(
      (host) => host.id === selectedAddProjectHostId && canSelectAddRepoHost(host)
    ) ??
    hostOptions.find((host) => host.id === LOCAL_EXECUTION_HOST_ID && canSelectAddRepoHost(host)) ??
    hostOptions.find((host) => canSelectAddRepoHost(host)) ??
    hostOptions[0]
  const selectedHostId = selectedHost?.id ?? LOCAL_EXECUTION_HOST_ID
  const selectedParsedHost = parseExecutionHostId(selectedHostId)

  const handleSelectAddProjectHost = async (hostId: ExecutionHostId): Promise<void> => {
    const host = hostOptions.find((candidate) => candidate.id === hostId)
    if (!host || !canSelectAddRepoHost(host)) {
      return
    }
    const parsed = parseExecutionHostId(hostId)
    if (parsed?.kind === 'runtime') {
      const switched = await switchRuntimeEnvironment(parsed.environmentId)
      if (!switched) {
        return
      }
    } else if (settings?.activeRuntimeEnvironmentId?.trim()) {
      const switched = await switchRuntimeEnvironment(null)
      if (!switched) {
        return
      }
    }
    setSelectedAddProjectHostId(hostId)
    setStep('add')
  }

  return {
    hostOptions,
    selectedHostId,
    selectedParsedHost,
    hostSelectorOpen,
    setHostSelectorOpen,
    handleSelectAddProjectHost
  }
}

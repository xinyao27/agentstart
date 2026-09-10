import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId,
  type ExecutionHostScope
} from '@agentstart/protocol/host/identity'
import { useState } from 'react'
import { getExecutionHostLabel } from '~renderer/execution-host/labels'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { getAiVaultResumeWorkspaceExecutionHostId } from '~renderer/workspace-panel/ai-vault/resume-target'

import type { AiVaultSessionResumeTargetState } from './session-resume'

export type AiVaultHostScopeOption = {
  id: ExecutionHostScope
  label: string
}

export function useAiVaultExecutionHostScope(args: {
  activeWorktreeId: string | null
  resumeTargetState: AiVaultSessionResumeTargetState
  availableExecutionHostScopes?: readonly ExecutionHostScope[]
}): {
  executionHostScope: ExecutionHostScope
  activeExecutionHostScope: ExecutionHostId | null
  onExecutionHostScopeChange: (scope: ExecutionHostScope) => void
} {
  const activeExecutionHostId = (() =>
    getAiVaultResumeWorkspaceExecutionHostId(args.resumeTargetState, args.activeWorktreeId))()
  const activeExecutionHost = parseExecutionHostId(activeExecutionHostId)
  const activeExecutionHostScope: ExecutionHostId | null =
    activeExecutionHost?.kind === 'runtime' ? activeExecutionHost.id : null
  const defaultExecutionHostScope: ExecutionHostScope =
    activeExecutionHostScope ?? LOCAL_EXECUTION_HOST_ID
  const [selection, setSelection] = useState<{
    scope: ExecutionHostScope
    isUserChanged: boolean
  }>({ scope: defaultExecutionHostScope, isUserChanged: false })
  const allowedScopes = new Set<ExecutionHostScope>([
    LOCAL_EXECUTION_HOST_ID,
    ALL_EXECUTION_HOSTS_SCOPE,
    ...(activeExecutionHostScope ? [activeExecutionHostScope] : []),
    ...(args.availableExecutionHostScopes ?? [])
  ])
  const executionHostScope =
    allowedScopes.has(selection.scope) && selection.isUserChanged
      ? selection.scope
      : defaultExecutionHostScope
  if (selection.scope !== executionHostScope) {
    setSelection({ scope: executionHostScope, isUserChanged: false })
  }

  const handleExecutionHostScopeChange = (nextScope: ExecutionHostScope) => {
    setSelection({
      scope: nextScope,
      isUserChanged: nextScope !== defaultExecutionHostScope
    })
  }

  return {
    executionHostScope,
    activeExecutionHostScope,
    onExecutionHostScopeChange: handleExecutionHostScopeChange
  }
}

export function buildRuntimeAiVaultHostScopeOptions(
  runtimeEnvironments: readonly Pick<PublicKnownRuntimeEnvironment, 'id' | 'name'>[]
): AiVaultHostScopeOption[] {
  return runtimeEnvironments.map((environment) => {
    const id = toRuntimeExecutionHostId(environment.id)
    const label = environment.name.trim() || getExecutionHostLabel(id)
    return { id, label }
  })
}

export function buildAiVaultHostScopeOptions(args: {
  activeExecutionHostScope: ExecutionHostId | null
  runtimeHostOptions: readonly AiVaultHostScopeOption[]
}): AiVaultHostScopeOption[] {
  const options: AiVaultHostScopeOption[] = []
  const seen = new Set<ExecutionHostScope>()
  const add = (option: AiVaultHostScopeOption): void => {
    if (seen.has(option.id)) {
      return
    }
    seen.add(option.id)
    options.push(option)
  }
  const activeHost = args.activeExecutionHostScope
    ? parseExecutionHostId(args.activeExecutionHostScope)
    : null

  add({ id: LOCAL_EXECUTION_HOST_ID, label: getExecutionHostLabel(LOCAL_EXECUTION_HOST_ID) })
  for (const option of args.runtimeHostOptions) {
    add(option)
  }
  if (activeHost?.kind === 'runtime') {
    add({ id: activeHost.id, label: getExecutionHostLabel(activeHost.id) })
  }
  add({ id: ALL_EXECUTION_HOSTS_SCOPE, label: getExecutionHostLabel(ALL_EXECUTION_HOSTS_SCOPE) })

  return options
}

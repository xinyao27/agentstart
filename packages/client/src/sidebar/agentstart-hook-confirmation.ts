import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import { resolveHookCommandSourcePolicy } from '@agentstart/protocol/setup/command-source-policy'
import type { AgentStartHooks } from '@agentstart/protocol/worktree/hooks'
import { getRuntimeEnvironmentIdForRepo } from '~renderer/repo/runtime-owner'
import { checkRuntimeHooks } from '~renderer/runtime/hooks-client'
import type { AppState } from '~renderer/store/types'

import { hashAgentStartHookScript, type AgentStartHookScriptKind } from './agentstart-hook-trust'

export type HookScriptKind = AgentStartHookScriptKind

let trustPromptChain: Promise<unknown> = Promise.resolve()

function enqueueTrustPrompt<T>(task: () => Promise<T>): Promise<T> {
  const next = trustPromptChain.then(task, task)
  trustPromptChain = next.catch(() => undefined)
  return next
}

function getSetupTrustContent(yamlHooks: AgentStartHooks | null): string {
  const defaultTabCommands = (yamlHooks?.defaultTabs ?? [])
    .map((tab, index) => {
      const command = tab.command?.trim()
      if (!command) {
        return null
      }
      const label = tab.title ? ` ${tab.title}` : ''
      return `# defaultTabs[${index + 1}]${label}\n${command}`
    })
    .filter((entry): entry is string => entry !== null)
  return [yamlHooks?.scripts?.setup?.trim(), ...defaultTabCommands].filter(Boolean).join('\n\n')
}

function findHookRepo(state: AppState, repoId: string, hostId?: ExecutionHostId) {
  return hostId
    ? state.repos.find((repo) => repo.id === repoId && getRepoExecutionHostId(repo) === hostId)
    : state.repos.find((repo) => repo.id === repoId)
}

function settingsForHookRepoOwner(
  state: AppState,
  repoId: string,
  hostId?: ExecutionHostId
): AppState['settings'] {
  const parsedHost = hostId ? parseExecutionHostId(hostId) : null
  const runtimeEnvironmentId = hostId
    ? parsedHost?.kind === 'runtime'
      ? parsedHost.environmentId
      : null
    : getRuntimeEnvironmentIdForRepo(state, repoId)
  // Why: hook inspection must follow the repo owner. Local repos execute
  // through desktop IPC, while runtime repos may differ from the focused host.
  return state.settings
    ? { ...state.settings, activeRuntimeEnvironmentId: runtimeEnvironmentId }
    : ({ activeRuntimeEnvironmentId: runtimeEnvironmentId } as AppState['settings'])
}

export async function ensureHooksConfirmed(
  state: AppState,
  repoId: string,
  scriptKind: HookScriptKind,
  hostId?: ExecutionHostId
): Promise<'run' | 'skip'> {
  return enqueueTrustPrompt(async () => {
    const hasDuplicateRepoId = state.repos.filter((repo) => repo.id === repoId).length > 1
    if (state.trustedAgentStartHooks[repoId]?.all && !(hostId && hasDuplicateRepoId)) {
      return 'run'
    }

    let scriptContent = ''
    try {
      const repo = findHookRepo(state, repoId, hostId)
      const localScript = repo?.hookSettings?.scripts?.[scriptKind]?.trim()
      const sourcePolicy = resolveHookCommandSourcePolicy(repo?.hookSettings?.commandSourcePolicy, {
        hasLocalScript: Boolean(localScript)
      })
      if (sourcePolicy === 'local-only') {
        return 'run'
      }
      const result = await checkRuntimeHooks(
        settingsForHookRepoOwner(state, repoId, hostId),
        repoId,
        hostId
      )
      if (result.status === 'error') {
        return 'skip'
      }
      const yamlHooks = (result.hooks as AgentStartHooks | null) ?? null
      scriptContent =
        scriptKind === 'setup'
          ? getSetupTrustContent(yamlHooks)
          : (yamlHooks?.scripts.archive ?? '').trim()
    } catch {
      // Why: when a script cannot be inspected, it cannot be trusted to run.
      return 'skip'
    }

    if (!scriptContent) {
      return 'run'
    }

    const contentHash = await hashAgentStartHookScript(scriptContent)
    const existingHash = state.trustedAgentStartHooks[repoId]?.[scriptKind]?.contentHash
    if (existingHash === contentHash) {
      return 'run'
    }

    const repo = findHookRepo(state, repoId, hostId)
    const repoName = repo?.displayName ?? 'this repository'
    const previouslyApproved = Boolean(existingHash)

    return new Promise<'run' | 'skip'>((resolve) => {
      state.openModal('confirm-agentstart-yaml-hooks', {
        repoId,
        repoName,
        scriptKind,
        scriptContent,
        contentHash,
        previouslyApproved,
        onResolve: (decision: 'run' | 'skip') => resolve(decision)
      })
    })
  })
}

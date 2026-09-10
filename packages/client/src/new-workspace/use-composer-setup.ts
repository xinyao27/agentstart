import type { Repo } from '@agentstart/protocol/project/repository'
import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { SetupAgentStartupPolicy, SetupRunPolicy } from '@agentstart/protocol/worktree/hooks'
import type { AgentStartHooks } from '@agentstart/protocol/worktree/hooks'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { checkRuntimeHooks, type HookCheckResult } from '~renderer/runtime/hooks-client'
import { useAppStore } from '~renderer/store/state'

import {
  buildSetupAgentStartupHookSettings,
  getRepoSetupAgentStartupPolicy
} from './composer-initial-state'
import { getSetupConfig } from './workspace-creation'

type UseComposerSetupOptions = {
  repoId: string
  repos: Repo[]
  selectedRepo: Repo | undefined
  selectedRepoIsGit: boolean
  selectedRepoSettings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
}

export function useComposerSetup({
  repoId,
  repos,
  selectedRepo,
  selectedRepoIsGit,
  selectedRepoSettings
}: UseComposerSetupOptions) {
  const updateRepo = useAppStore((state) => state.updateRepo)
  const repoIdRef = useRef(repoId)
  const reposRef = useRef(repos)
  const selectedRepoSettingsRef = useRef(selectedRepoSettings)
  const [hookCheckResult, setHookCheckResult] = useState<{
    repoId: string
    hooks: AgentStartHooks | null
  } | null>(null)
  const [policyDraft, setPolicyDraft] = useState<{
    repoId: string
    policy: SetupAgentStartupPolicy
  } | null>(null)
  const [decisionState, setDecisionState] = useState<{
    key: string
    value: 'run' | 'skip'
  } | null>(null)
  const policySaveRef = useRef<{
    repoId: string
    policy: SetupAgentStartupPolicy
    promise: Promise<boolean>
  } | null>(null)
  const hookCheckRef = useRef<{ key: string; promise: Promise<HookCheckResult> } | null>(null)
  useEffect(() => {
    repoIdRef.current = repoId
    reposRef.current = repos
    selectedRepoSettingsRef.current = selectedRepoSettings
  }, [repoId, repos, selectedRepoSettings])

  const setupAgentStartupPolicy =
    policyDraft?.repoId === repoId
      ? policyDraft.policy
      : getRepoSetupAgentStartupPolicy(selectedRepo)
  const loadHookCheckForRepo = useEventCallback(
    (targetRepoId: string): Promise<HookCheckResult> => {
      const key = `${selectedRepoSettingsRef.current?.activeRuntimeEnvironmentId ?? 'local'}:${targetRepoId}`
      const existing = hookCheckRef.current
      if (existing?.key === key) {
        return existing.promise
      }
      const promise = checkRuntimeHooks(selectedRepoSettingsRef.current, targetRepoId)
      hookCheckRef.current = { key, promise }
      return promise
    }
  )
  const commitHookCheckIfCurrent = useEventCallback(
    (targetRepoId: string, hooks: AgentStartHooks | null): boolean => {
      if (repoIdRef.current !== targetRepoId) {
        return false
      }
      setHookCheckResult({ repoId: targetRepoId, hooks })
      return true
    }
  )

  useEffect(() => {
    if (!repoId || !selectedRepoIsGit) {
      return
    }
    let isCancelled = false
    void loadHookCheckForRepo(repoId)
      .then((result) => {
        if (!isCancelled) {
          commitHookCheckIfCurrent(repoId, result.hooks)
        }
      })
      .catch(() => {
        if (!isCancelled) {
          commitHookCheckIfCurrent(repoId, null)
        }
      })
    return () => {
      isCancelled = true
    }
  }, [commitHookCheckIfCurrent, loadHookCheckForRepo, repoId, selectedRepoIsGit])

  const persistSetupAgentStartupPolicy = async (
    policy: SetupAgentStartupPolicy = setupAgentStartupPolicy
  ): Promise<boolean> => {
    while (true) {
      const currentRepo = reposRef.current.find((repo) => repo.id === repoId)
      if (!currentRepo || !isGitRepoKind(currentRepo)) {
        return true
      }
      const pendingSave = policySaveRef.current
      if (pendingSave?.repoId === currentRepo.id) {
        if (pendingSave.policy === policy) {
          return pendingSave.promise
        }
        await pendingSave.promise
        continue
      }
      if (getRepoSetupAgentStartupPolicy(currentRepo) === policy) {
        return true
      }
      const promise = updateRepo(currentRepo.id, {
        hookSettings: buildSetupAgentStartupHookSettings(currentRepo.hookSettings, policy)
      }).finally(() => {
        if (policySaveRef.current?.promise === promise) {
          policySaveRef.current = null
        }
      })
      policySaveRef.current = { repoId: currentRepo.id, policy, promise }
      return promise
    }
  }

  const handleSetupAgentStartupPolicyChange = (policy: SetupAgentStartupPolicy): void => {
    setPolicyDraft({ repoId, policy })
    void persistSetupAgentStartupPolicy(policy).then((saved) => {
      if (!saved) {
        toast.error(
          translate(
            'auto.hooks.useComposerState.setupAgentStartupPolicySaveFailed',
            'Failed to save setup startup behavior.'
          )
        )
      }
    })
  }

  const yamlHooks = hookCheckResult?.repoId === repoId ? hookCheckResult.hooks : null
  const checkedHooksRepoId = selectedRepoIsGit
    ? hookCheckResult?.repoId === repoId
      ? repoId
      : null
    : repoId
  const setupConfig = selectedRepoIsGit ? getSetupConfig(selectedRepo, yamlHooks) : null
  const setupPolicy: SetupRunPolicy = selectedRepo?.hookSettings?.setupRunPolicy ?? 'run-by-default'
  const isSetupCheckPending = Boolean(repoId) && checkedHooksRepoId !== repoId
  const shouldWaitForSetupCheck = Boolean(selectedRepo) && selectedRepoIsGit && isSetupCheckPending
  const decisionKey = `${repoId}:${checkedHooksRepoId ?? 'pending'}:${setupPolicy}:${JSON.stringify(setupConfig)}`
  const defaultDecision =
    shouldWaitForSetupCheck || !setupConfig || setupPolicy === 'ask'
      ? null
      : setupPolicy === 'run-by-default'
        ? 'run'
        : 'skip'
  const setupDecision = decisionState?.key === decisionKey ? decisionState.value : defaultDecision

  return {
    checkedHooksRepoId,
    commitHookCheckIfCurrent,
    handleSetupAgentStartupPolicyChange,
    handleSetupDecisionChange: (value: 'run' | 'skip'): void => {
      setDecisionState({ key: decisionKey, value })
    },
    loadHookCheckForRepo,
    persistSetupAgentStartupPolicy,
    requiresExplicitSetupChoice: Boolean(setupConfig) && setupPolicy === 'ask',
    resolvedSetupDecision: setupDecision,
    setupAgentStartupPolicy,
    setupConfig,
    setupDecision,
    setupPolicy,
    shouldWaitForSetupCheck
  }
}

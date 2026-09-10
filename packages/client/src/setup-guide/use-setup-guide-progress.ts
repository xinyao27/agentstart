import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import { hasFeatureInteraction } from '@agentstart/protocol/telemetry/interactions/state'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  COMPUTER_USE_SKILL_NAME,
  AGENTSTART_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from '~renderer/agent/feature-install-commands'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { openComputerTarget } from '~renderer/runtime/computer-target'
import { checkRuntimeHooks } from '~renderer/runtime/hooks-client'
import { hasEffectiveSetupCommand } from '~renderer/setup-guide/setup-script-status'
import { useActiveProjectSkillRuntime } from '~renderer/skills/use-active-project-runtime'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '~renderer/skills/use-installed-agents'
import { useAppStore } from '~renderer/store/state'

import {
  getFeatureWallSetupProgress,
  type FeatureWallSetupProgress
} from '../feature-wall/setup-progress'
import { useSetupGuideBrowserMilestoneProgress } from './browser-milestone-progress'
import {
  getComputerUsePermissionSetupState,
  getCurrentSetupScriptProbeState,
  getSetupGuideProgressReady,
  getSetupScriptProbeSignature
} from './progress-readiness'
import {
  readSetupScriptProbeCache,
  setSetupScriptProbeCache,
  subscribeSetupScriptProbeCache
} from './setup-script-probe-cache'

const SETUP_SCRIPT_PROBE_SETTLE_TIMEOUT_MS = 15_000

export function useSetupGuideProgress(
  shouldRefreshCoreState: boolean,
  orchestrationSkillInstalled: boolean,
  browserUseSkillInstalled: boolean
): FeatureWallSetupProgress {
  const settings = useAppStore((s) => s.settings)
  const featureInteractions = useAppStore((s) => s.featureInteractions)
  const { repos, worktreesByRepo } = useProjectCatalog()
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const setupScriptProbe = useSyncExternalStore(
    subscribeSetupScriptProbeCache,
    readSetupScriptProbeCache,
    readSetupScriptProbeCache
  )
  const [computerUsePermissionsReady, setComputerUsePermissionsReady] = useState(false)
  const [computerUsePermissionStatusChecked, setComputerUsePermissionStatusChecked] =
    useState(false)
  const [computerUseUnavailable, setComputerUseUnavailable] = useState(false)
  const { installed: detectedBrowserUseSkillInstalled, loading: detectedBrowserUseSkillLoading } =
    useInstalledAgentSkill(AGENTSTART_CLI_SKILL_NAME, {
      enabled: shouldRefreshCoreState,
      discoveryTarget: activeSkillRuntime.discoveryTarget,
      sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
    })
  const { installed: computerUseSkillInstalled, loading: computerUseSkillLoading } =
    useInstalledAgentSkill(COMPUTER_USE_SKILL_NAME, {
      enabled: shouldRefreshCoreState,
      discoveryTarget: activeSkillRuntime.discoveryTarget,
      sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
    })
  const {
    installed: detectedOrchestrationSkillInstalled,
    loading: detectedOrchestrationSkillLoading
  } = useInstalledAgentSkill(ORCHESTRATION_SKILL_NAME, {
    enabled: shouldRefreshCoreState,
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const permissionCheckActive = shouldRefreshCoreState && computerUseSkillInstalled
  const [wasPermissionCheckActive, setWasPermissionCheckActive] = useState(permissionCheckActive)
  if (wasPermissionCheckActive !== permissionCheckActive) {
    setWasPermissionCheckActive(permissionCheckActive)
    setComputerUsePermissionStatusChecked(false)
    setComputerUsePermissionsReady(false)
    setComputerUseUnavailable(false)
  }
  const orderedGitRepos = (() => {
    const gitRepos = repos.filter(isGitRepoKind)
    const activeRepo = activeRepoId
      ? (gitRepos.find((repo) => repo.id === activeRepoId) ?? null)
      : null
    return activeRepo
      ? [activeRepo, ...gitRepos.filter((repo) => repo.id !== activeRepo.id)]
      : gitRepos
  })()

  const setupScriptProbeSignature = (() =>
    getSetupScriptProbeSignature(settings, orderedGitRepos))()
  const activeSetupScriptProbeSignatureRef = useRef<string | null>(setupScriptProbeSignature)
  useEffect(() => {
    activeSetupScriptProbeSignatureRef.current = setupScriptProbeSignature
  }, [setupScriptProbeSignature])

  useEffect(() => {
    if (!shouldRefreshCoreState || !settings || setupScriptProbeSignature === null) {
      return
    }
    const signature = setupScriptProbeSignature
    let stale = false
    // Why: setup-script checks can cross SSH/runtime streams. Bound sidebar
    // visibility readiness so a wedged read cannot hide the checklist forever.
    const timeoutId = window.setTimeout(() => {
      if (activeSetupScriptProbeSignatureRef.current === signature) {
        setSetupScriptProbeCache({ signature, ready: true, hasSetupScript: false })
      }
    }, SETUP_SCRIPT_PROBE_SETTLE_TIMEOUT_MS)

    const settle = (hasSetupScript: boolean): void => {
      window.clearTimeout(timeoutId)
      if (activeSetupScriptProbeSignatureRef.current === signature) {
        setSetupScriptProbeCache({ signature, ready: true, hasSetupScript })
      }
    }

    async function refreshSetupScriptState(): Promise<void> {
      for (const repo of orderedGitRepos) {
        const hooksResult = await checkRuntimeHooks(settings, repo.id).catch(() => null)
        if (stale) {
          return
        }
        if (hooksResult && hasEffectiveSetupCommand(repo, hooksResult)) {
          settle(true)
          return
        }
      }
      settle(false)
    }

    void refreshSetupScriptState()
    return () => {
      stale = true
      window.clearTimeout(timeoutId)
    }
  }, [orderedGitRepos, settings, setupScriptProbeSignature, shouldRefreshCoreState])

  const readComputerUsePermissions = useEventCallback(
    async (isStale: () => boolean): Promise<void> => {
      const status = await openComputerTarget()
        .then((client) => (client ? client.permissionsStatus() : null))
        .catch(() => null)
      if (isStale()) {
        return
      }
      const permissionState = getComputerUsePermissionSetupState(status)
      setComputerUsePermissionStatusChecked(true)
      setComputerUsePermissionsReady(permissionState.ready)
      setComputerUseUnavailable(permissionState.unavailable)
    }
  )

  useEffect(() => {
    if (!shouldRefreshCoreState || !computerUseSkillInstalled) {
      return
    }
    let stale = false
    const refreshComputerUsePermissions = (): void => {
      void readComputerUsePermissions(() => stale)
    }
    refreshComputerUsePermissions()
    const handleFocus = (): void => {
      void refreshComputerUsePermissions()
    }
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void refreshComputerUsePermissions()
      }
    }
    // Why: users grant Computer Use permissions outside the setup guide. Refresh
    // on return so the checklist updates without requiring a remount.
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      stale = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [computerUseSkillInstalled, readComputerUsePermissions, shouldRefreshCoreState])

  const gitRepoCount = orderedGitRepos.length
  const currentSetupScriptProbe = getCurrentSetupScriptProbeState(
    setupScriptProbe,
    setupScriptProbeSignature
  )
  const currentComputerUsePermissionStatusChecked =
    shouldRefreshCoreState && computerUseSkillInstalled ? computerUsePermissionStatusChecked : false
  const currentComputerUsePermissionsReady =
    shouldRefreshCoreState && computerUseSkillInstalled ? computerUsePermissionsReady : false
  const currentComputerUseUnavailable =
    shouldRefreshCoreState && computerUseSkillInstalled ? computerUseUnavailable : false
  const ready = getSetupGuideProgressReady({
    refreshEnabled: shouldRefreshCoreState,
    settingsLoaded: settings !== null,
    preflightStatusChecked: true,
    browserUseSkillDiscoveryLoading: detectedBrowserUseSkillLoading,
    computerUseSkillDiscoveryLoading: computerUseSkillLoading,
    orchestrationSkillDiscoveryLoading: detectedOrchestrationSkillLoading,
    setupScriptProbeReady: currentSetupScriptProbe.ready,
    computerUseSkillInstalled,
    computerUsePermissionStatusChecked: currentComputerUsePermissionStatusChecked
  })

  const rawProgress = (() =>
    getFeatureWallSetupProgress({
      ready,
      settings,
      featureInteractions,
      browserUseSkillInstalled: browserUseSkillInstalled || detectedBrowserUseSkillInstalled,
      computerUseSkillInstalled,
      computerUsePermissionsReady: currentComputerUsePermissionsReady,
      computerUseUnavailable: currentComputerUseUnavailable,
      orchestrationSkillInstalled:
        orchestrationSkillInstalled || detectedOrchestrationSkillInstalled,
      gitRepoCount,
      worktreesByRepo,
      hasSetupScript: currentSetupScriptProbe.hasSetupScript
    }))()
  const historicalSplitTerminalDone = hasFeatureInteraction(
    featureInteractions,
    'terminal-pane-split'
  )
  return useSetupGuideBrowserMilestoneProgress(rawProgress, historicalSplitTerminalDone)
}

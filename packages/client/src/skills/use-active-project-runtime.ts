import type { ProjectExecutionRuntimeResolution } from '@yiru/protocol/project/runtime-preference'
import { useShallow } from 'zustand/react/shallow'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { getRenderingHostSnapshot } from '~renderer/runtime/shell-platform-client'
import type { SkillDiscoveryTarget } from '~renderer/skills/discovery-target'
import {
  getProjectAgentSkillRuntime,
  getProjectAgentSkillTerminalShellOverride,
  getProjectSkillDiscoveryTarget,
  getProjectSkillInstallDisabledReason,
  type ProjectAgentSkillRuntime
} from '~renderer/skills/project-runtime'
import { useAppStore } from '~renderer/store/state'
import { useWindowsTerminalCapabilities } from '~renderer/terminal/windows/capabilities'

type ActiveProjectSkillRuntime = {
  projectRuntime?: ProjectExecutionRuntimeResolution
  discoveryTarget?: SkillDiscoveryTarget
  agentRuntime?: ProjectAgentSkillRuntime
  terminalShellOverride?: string
  installDisabledReason: string | null
}

const EMPTY_ACTIVE_PROJECT_SKILL_RUNTIME: ActiveProjectSkillRuntime = Object.freeze({
  installDisabledReason: null
})

export function useActiveProjectSkillRuntime(): ActiveProjectSkillRuntime {
  const catalog = useProjectCatalog()
  const { worktreesByRepo } = projectCatalogRepoBuckets(catalog)
  const runtimeUiState = useAppStore(
    useShallow((state) => ({
      activeRepoId: state.activeRepoId,
      activeWorktreeId: state.activeWorktreeId,
      settings: state.settings
    }))
  )
  const runtimeState = {
    ...runtimeUiState,
    projects: catalog.projects,
    repos: catalog.repos,
    worktreesByRepo
  }
  const currentPlatform = getCurrentPlatform()
  const windowsCapabilities = useWindowsTerminalCapabilities(currentPlatform === 'win32')

  return (() => {
    const projectRuntime = getLocalProjectExecutionRuntimeContext(
      runtimeState,
      undefined,
      currentPlatform,
      {
        wslAvailable: windowsCapabilities.isLoading ? undefined : windowsCapabilities.wslAvailable,
        availableWslDistros: windowsCapabilities.isLoading ? null : windowsCapabilities.wslDistros
      }
    )
    if (!projectRuntime) {
      return EMPTY_ACTIVE_PROJECT_SKILL_RUNTIME
    }

    const agentRuntime = getProjectAgentSkillRuntime(projectRuntime, currentPlatform)
    return {
      projectRuntime,
      discoveryTarget: getProjectSkillDiscoveryTarget(projectRuntime),
      agentRuntime,
      terminalShellOverride: getProjectAgentSkillTerminalShellOverride(
        currentPlatform,
        runtimeState.settings,
        agentRuntime
      ),
      installDisabledReason: getProjectSkillInstallDisabledReason(projectRuntime)
    }
  })()
}

function getCurrentPlatform(): NodeJS.Platform {
  const platform = typeof window === 'undefined' ? undefined : getRenderingHostSnapshot().platform
  if (platform) {
    return platform
  }

  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (userAgent.includes('Windows')) {
    return 'win32'
  }
  if (userAgent.includes('Mac')) {
    return 'darwin'
  }
  return 'linux'
}

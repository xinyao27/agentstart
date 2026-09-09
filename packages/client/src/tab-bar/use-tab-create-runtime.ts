import type { TuiAgent } from '@yiru/protocol/agent/types'
import {
  type BuiltInWindowsTerminalShell,
  WINDOWS_GIT_BASH_SHELL
} from '@yiru/protocol/host/windows-terminal-shell'
import type { ProjectExecutionRuntimeResolution } from '@yiru/protocol/project/runtime-preference'
import type { Tab } from '@yiru/protocol/workspace/tabs'
import { type AgentDetectionTarget, useDetectedAgents } from '~renderer/agent/use-detected'
import { translate } from '~renderer/i18n/i18n'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { getConnectionIdFromState } from '~renderer/runtime/connection-context'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'
import {
  getWindowsTerminalCapabilityOwnerKey,
  useWindowsTerminalCapabilities
} from '~renderer/terminal/windows/capabilities'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { shouldShowMobileEmulatorTabIntro } from '../emulator-pane/mobile-emulator-tab-intro-visibility'
import { buildTabAgentLaunchOptions, orderTabLaunchAgents } from './tab-agent-launch-options'
import type { TabBarProps } from './tab-bar-types'
import { shouldShowWindowsShellMenu } from './windows-shell-menu-visibility'

const EMPTY_AGENT_CMD_OVERRIDES: Partial<Record<TuiAgent, string>> = {}
const EMPTY_UNIFIED_TABS: readonly Tab[] = []
const AGENT_DETECTION_LOCAL_TARGET_KEY = 'local'
const isWindows = navigator.userAgent.includes('Windows')
const isMacOs = navigator.userAgent.includes('Mac')

export type WindowsShellEntry = {
  label: string
  shell: BuiltInWindowsTerminalShell
}

function getProjectRuntimeShellMenuMode(
  projectRuntime: ProjectExecutionRuntimeResolution | undefined
): 'host' | 'wsl' | null {
  if (!projectRuntime) {
    return null
  }
  if (projectRuntime.status === 'repair-required') {
    return 'wsl'
  }
  return projectRuntime.runtime.kind === 'wsl' ? 'wsl' : 'host'
}

export function useTabCreateRuntime(props: TabBarProps) {
  const { groupId, onNewTerminalWithShell, worktreeId } = props
  const mobileEmulatorEnabled = useAppStore(
    (state) => state.settings?.mobileEmulatorEnabled !== false
  )
  const persistedUIReady = useAppStore((state) => state.persistedUIReady)
  const introDismissed = useAppStore((state) => state.mobileEmulatorTabIntroDismissed)
  const defaultWindowsShell = useAppStore(
    (state) => state.settings?.terminalWindowsShell ?? 'powershell.exe'
  )
  const defaultPowerShellImplementation = useAppStore(
    (state) => state.settings?.terminalWindowsPowerShellImplementation ?? 'auto'
  )
  const activeRepoId = useAppStore((state) => state.activeRepoId)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const { projects, repos, worktreesByRepo } = useProjectCatalog()
  const settings = useAppStore((state) => state.settings)
  const activeGroupId = useAppStore((state) => state.activeGroupIdByWorktree[worktreeId])
  const unifiedTabs = useAppStore(
    (state) => state.unifiedTabsByWorktree[worktreeId] ?? EMPTY_UNIFIED_TABS
  )
  const activeRuntimeEnvironmentId = useAppStore(
    (state) => getRuntimeEnvironmentIdForWorktree(state, worktreeId)?.trim() || null
  )
  const connectionId = useAppStore(
    (state) => getConnectionIdFromState(state, worktreeId)?.trim() || null
  )
  const remotePlatform = useAppStore((state) =>
    connectionId ? (state.sshConnectionStates.get(connectionId)?.remotePlatform ?? null) : null
  )
  const defaultAgent = useAppStore((state) => state.settings?.defaultTuiAgent)
  const agentCmdOverrides = useAppStore(
    (state) => state.settings?.agentCmdOverrides ?? EMPTY_AGENT_CMD_OVERRIDES
  )
  const detectionTargetKey = useAppStore((state): string | undefined => {
    const selectedConnectionId = getConnectionIdFromState(state, worktreeId)
    if (selectedConnectionId === undefined) {
      return undefined
    }
    if (selectedConnectionId?.trim()) {
      return `ssh:${selectedConnectionId.trim()}`
    }
    const environmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)?.trim()
    return environmentId ? `runtime:${environmentId}` : AGENT_DETECTION_LOCAL_TARGET_KEY
  })
  const detectionTarget: AgentDetectionTarget | undefined = (() => {
    if (detectionTargetKey === undefined) {
      return undefined
    }
    if (detectionTargetKey.startsWith('ssh:')) {
      return { kind: 'ssh', connectionId: detectionTargetKey.slice(4) }
    }
    if (detectionTargetKey.startsWith('runtime:')) {
      return { kind: 'runtime', environmentId: detectionTargetKey.slice(8) }
    }
    return { kind: 'local' }
  })()
  const { detectedIds } = useDetectedAgents(detectionTarget)
  const agentLaunchOptions = (() =>
    buildTabAgentLaunchOptions(
      orderTabLaunchAgents(defaultAgent, detectedIds ?? []),
      agentCmdOverrides
    ))()
  const capabilityOwnerKey = getWindowsTerminalCapabilityOwnerKey(
    activeRuntimeEnvironmentId,
    connectionId
  )
  const runtimeTarget = (() => getActiveRuntimeTarget({ activeRuntimeEnvironmentId }))()
  const capabilities = useWindowsTerminalCapabilities(
    isWindows || Boolean(activeRuntimeEnvironmentId) || Boolean(connectionId),
    false,
    capabilityOwnerKey,
    runtimeTarget,
    connectionId
  )
  const hostPlatform = connectionId
    ? (remotePlatform ?? capabilities.hostPlatform)
    : capabilities.hostPlatform
  const showWindowsShellMenu = shouldShowWindowsShellMenu({
    activeRuntimeEnvironmentId,
    hostPlatform,
    isWindowsClient: isWindows,
    worktreeHasRemoteConnection: Boolean(connectionId)
  })
  const projectRuntime = (() => {
    if (!showWindowsShellMenu || activeRuntimeEnvironmentId || connectionId) {
      return undefined
    }
    return getLocalProjectExecutionRuntimeContext(
      { activeRepoId, activeWorktreeId, projects, repos, settings, worktreesByRepo },
      worktreeId,
      'win32',
      {
        wslAvailable: capabilities.isLoading ? undefined : capabilities.wslAvailable,
        availableWslDistros: capabilities.isLoading ? null : capabilities.wslDistros
      }
    )
  })()
  const shellMode = getProjectRuntimeShellMenuMode(projectRuntime)
  const windowsShellEntries = (() => {
    if (!showWindowsShellMenu || !onNewTerminalWithShell) {
      return undefined
    }
    const entries: WindowsShellEntry[] = []
    if (shellMode !== 'wsl') {
      entries.push(
        {
          label: translate('auto.components.tab.bar.TabBar.2148f65e04', 'PowerShell'),
          shell: 'powershell.exe'
        },
        {
          label: translate('auto.components.tab.bar.TabBar.1a8af49530', 'CMD Prompt'),
          shell: 'cmd.exe'
        }
      )
      if (capabilities.gitBashAvailable) {
        entries.push({
          label: translate('auto.components.tab.bar.TabBar.efb33546ff', 'Git Bash'),
          shell: WINDOWS_GIT_BASH_SHELL
        })
      }
    }
    if (shellMode !== 'host' && capabilities.wslAvailable) {
      entries.push({
        label: translate('auto.components.tab.bar.TabBar.d1afac112b', 'WSL'),
        shell: 'wsl.exe'
      })
    }
    if (entries.length === 0) {
      return undefined
    }
    const defaultEntry = entries.find((entry) => entry.shell === defaultWindowsShell) ?? entries[0]
    return [defaultEntry, ...entries.filter((entry) => entry.shell !== defaultEntry.shell)]
  })()

  return {
    agentLaunchOptions,
    defaultPowerShellImplementation,
    mobileEmulatorEnabled,
    pwshAvailable: capabilities.pwshAvailable,
    resolvedGroupId: groupId ?? activeGroupId ?? worktreeId,
    showMobileEmulatorIntroCallout: shouldShowMobileEmulatorTabIntro({
      persistedUIReady,
      mobileEmulatorTabIntroDismissed: introDismissed,
      mobileEmulatorEnabled,
      isMacOs
    }),
    windowsShellEntries,
    workspaceHasSimulatorTab: unifiedTabs.some((tab) => tab.contentType === 'simulator')
  }
}

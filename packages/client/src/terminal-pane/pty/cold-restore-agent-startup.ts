import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@yiru/protocol/agent/launch-defaults'
import { buildAgentResumeStartupPlan } from '@yiru/protocol/agent/resume-startup'
import {
  agentProviderSessionsEqual,
  isResumableTuiAgent,
  normalizeAgentProviderSession,
  type ResumableTuiAgent
} from '@yiru/protocol/agent/session-resume'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { useAppStore } from '~renderer/store/state'

import type { SleepingAgentRecordEntry } from './sleeping-agent-record'
import { clearSleepingAgentRecordDuplicates } from './sleeping-agent-record'

export type ColdRestoreAgentResumeStartup = {
  agent: ResumableTuiAgent
  command: string
  env: Record<string, string>
  launchConfig: NonNullable<ReturnType<typeof buildAgentResumeStartupPlan>>['launchConfig']
  launchToken: string
  useLiveEntry: boolean
  hasSleepingRecord: boolean
  sleepingRecordEntry: SleepingAgentRecordEntry | null
}

type ColdRestoreAgentStartupOptions = {
  paneKey: string
  tabId: string
  leafId: string
  hasPendingStartupCommand: () => boolean
  getResumePlatform: () => NodeJS.Platform
  getSleepingRecord: (
    state: ReturnType<typeof useAppStore.getState>
  ) => SleepingAgentRecordEntry | null
}

export type ColdRestoreAgentStartup = {
  build: () => ColdRestoreAgentResumeStartup | null
  register: (startup: ColdRestoreAgentResumeStartup | null) => void
  clearSleepingRecordAfterSpawn: (startup: ColdRestoreAgentResumeStartup | null) => void
}

export function createColdRestoreAgentStartup(
  options: ColdRestoreAgentStartupOptions
): ColdRestoreAgentStartup {
  const build = (): ColdRestoreAgentResumeStartup | null => {
    if (options.hasPendingStartupCommand()) {
      return null
    }
    const state = useAppStore.getState()
    const entry = state.agentStatusByPaneKey[options.paneKey]
    const sleepingRecordEntry = options.getSleepingRecord(state)
    const sleepingRecord = sleepingRecordEntry?.record
    const useLiveEntry = entry && entry.state !== 'done'
    const agent = useLiveEntry ? entry.agentType : sleepingRecord?.agent
    if (!agent || !isResumableTuiAgent(agent)) {
      return null
    }
    const providerSession = normalizeAgentProviderSession(
      useLiveEntry ? entry.providerSession : sleepingRecord?.providerSession
    )
    if (!providerSession) {
      return null
    }
    const matchingSleepingLaunchConfig =
      sleepingRecord?.launchConfig &&
      (!useLiveEntry ||
        (sleepingRecord.agent === agent &&
          agentProviderSessionsEqual(agent, sleepingRecord.providerSession, providerSession)))
        ? sleepingRecord.launchConfig
        : undefined
    const launchConfig =
      (useLiveEntry && entry ? state.getAgentLaunchConfigForStatusEntry(entry) : undefined) ??
      matchingSleepingLaunchConfig
    const startupPlan = buildAgentResumeStartupPlan({
      agent,
      providerSession,
      cmdOverrides: state.settings?.agentCmdOverrides ?? {},
      agentArgs:
        launchConfig !== undefined
          ? launchConfig.agentArgs
          : resolveTuiAgentLaunchArgs(agent, state.settings?.agentDefaultArgs),
      agentEnv:
        launchConfig !== undefined
          ? launchConfig.agentEnv
          : resolveTuiAgentLaunchEnv(agent, state.settings?.agentDefaultEnv),
      ...(launchConfig?.agentCommand ? { agentCommand: launchConfig.agentCommand } : {}),
      ...(launchConfig?.ompResumeFilePath
        ? { ompResumeFilePath: launchConfig.ompResumeFilePath }
        : {}),
      platform: options.getResumePlatform()
    })
    if (!startupPlan) {
      return null
    }
    const launchToken = createBrowserUuid()
    return {
      agent,
      command: startupPlan.launchCommand,
      env: {
        ...startupPlan.env,
        YIRU_AGENT_LAUNCH_TOKEN: launchToken
      },
      launchConfig: startupPlan.launchConfig,
      launchToken,
      useLiveEntry: Boolean(useLiveEntry),
      hasSleepingRecord: Boolean(sleepingRecord),
      sleepingRecordEntry
    }
  }

  return {
    build,
    register: (startup) => {
      if (!startup) {
        return
      }
      useAppStore.getState().registerAgentLaunchConfig(options.paneKey, startup.launchConfig, {
        agentType: startup.agent,
        launchToken: startup.launchToken,
        tabId: options.tabId,
        leafId: options.leafId
      })
    },
    clearSleepingRecordAfterSpawn: (startup) => {
      if (startup && !startup.useLiveEntry && startup.sleepingRecordEntry) {
        clearSleepingAgentRecordDuplicates(useAppStore.getState(), startup.sleepingRecordEntry)
      }
    }
  }
}

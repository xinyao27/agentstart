import {
  agentProviderSessionsEqual,
  type AgentProviderSessionMetadata,
  type SleepingAgentLaunchConfig
} from '@agentstart/protocol/agent/session-resume'
import type { AgentStatusEntry, AgentType } from '@agentstart/protocol/agent/status-records'

import type { AppState } from '../../store/types'
import { getLeafIdFromPaneKey, getTabIdFromPaneKey } from './retention-model'
import type { AgentLaunchConfigRegistrationMetadata, AgentLaunchConfigRegistryEntry } from './slice'

export function copyLaunchConfig(config: SleepingAgentLaunchConfig): SleepingAgentLaunchConfig {
  return {
    ...(config.agentCommand ? { agentCommand: config.agentCommand } : {}),
    agentArgs: config.agentArgs,
    agentEnv: { ...config.agentEnv },
    ...(config.ompResumeFilePath ? { ompResumeFilePath: config.ompResumeFilePath } : {})
  }
}

export function launchConfigsEqual(
  a: SleepingAgentLaunchConfig | undefined,
  b: SleepingAgentLaunchConfig | undefined
): boolean {
  if (a === undefined || b === undefined) {
    return a === b
  }
  if (
    a.agentCommand !== b.agentCommand ||
    a.agentArgs !== b.agentArgs ||
    a.ompResumeFilePath !== b.ompResumeFilePath
  ) {
    return false
  }
  const aKeys = Object.keys(a.agentEnv)
  const bKeys = Object.keys(b.agentEnv)
  return aKeys.length === bKeys.length && aKeys.every((key) => a.agentEnv[key] === b.agentEnv[key])
}

export function normalizeLaunchConfigRegistrationMetadata(
  paneKey: string,
  metadata: AgentLaunchConfigRegistrationMetadata | undefined
): AgentLaunchConfigRegistrationMetadata {
  return {
    ...(metadata?.agentType ? { agentType: metadata.agentType } : {}),
    ...(metadata?.launchToken ? { launchToken: metadata.launchToken } : {}),
    tabId: metadata?.tabId ?? getTabIdFromPaneKey(paneKey) ?? undefined,
    leafId: metadata?.leafId ?? getLeafIdFromPaneKey(paneKey) ?? undefined,
    ...(metadata?.terminalHandle ? { terminalHandle: metadata.terminalHandle } : {}),
    ...(metadata?.providerSession ? { providerSession: metadata.providerSession } : {})
  }
}

export function launchConfigRegistryEntriesEqual(
  a: AgentLaunchConfigRegistryEntry | undefined,
  b: AgentLaunchConfigRegistryEntry
): boolean {
  return (
    a !== undefined &&
    launchConfigsEqual(a.launchConfig, b.launchConfig) &&
    a.identity.agentType === b.identity.agentType &&
    a.identity.launchToken === b.identity.launchToken &&
    a.identity.tabId === b.identity.tabId &&
    a.identity.leafId === b.identity.leafId &&
    a.identity.terminalHandle === b.identity.terminalHandle &&
    agentProviderSessionsEqual(
      a.identity.agentType ?? b.identity.agentType,
      a.identity.providerSession,
      b.identity.providerSession
    )
  )
}

export function registryEntryMatchesStatus(args: {
  entry: AgentLaunchConfigRegistryEntry | undefined
  paneKey: string
  agentType: AgentType | undefined
  tabId: string | undefined
  terminalHandle: string | undefined
  launchToken: string | undefined
  providerSession: AgentProviderSessionMetadata | undefined
  existingProviderSession: AgentProviderSessionMetadata | undefined
  providerSessionChanged: boolean
}): boolean {
  const entry = args.entry
  if (!entry || args.providerSessionChanged) {
    return false
  }
  const identity = entry.identity
  if (identity.agentType !== undefined && identity.agentType !== args.agentType) {
    return false
  }
  if (identity.tabId !== undefined && identity.tabId !== args.tabId) {
    return false
  }
  if (identity.leafId !== undefined && identity.leafId !== getLeafIdFromPaneKey(args.paneKey)) {
    return false
  }
  if (
    identity.terminalHandle !== undefined &&
    (args.terminalHandle === undefined || identity.terminalHandle !== args.terminalHandle)
  ) {
    return false
  }
  if (
    identity.launchToken !== undefined &&
    (args.launchToken === undefined || identity.launchToken !== args.launchToken)
  ) {
    // Why: missing or mismatched launch tokens are stale launch proof even if a
    // provider session id was reused by a later manual/mixed Codex run.
    return false
  }
  if (identity.providerSession !== undefined) {
    return agentProviderSessionsEqual(
      args.agentType,
      identity.providerSession,
      args.providerSession
    )
  }
  if (identity.launchToken !== undefined) {
    return true
  }
  if (identity.terminalHandle !== undefined) {
    return true
  }
  if (args.existingProviderSession && args.providerSession) {
    return agentProviderSessionsEqual(
      args.agentType,
      args.existingProviderSession,
      args.providerSession
    )
  }
  return false
}

export function getLaunchConfigForEntry(
  state: AppState,
  entry: AgentStatusEntry
): SleepingAgentLaunchConfig | undefined {
  const registryEntry = state.agentLaunchConfigByPaneKey[entry.paneKey]
  const registryLaunchConfig = registryEntryMatchesStatus({
    entry: registryEntry,
    paneKey: entry.paneKey,
    agentType: entry.agentType,
    tabId: entry.tabId ?? getTabIdFromPaneKey(entry.paneKey) ?? undefined,
    terminalHandle: entry.terminalHandle,
    launchToken: undefined,
    providerSession: entry.providerSession,
    existingProviderSession: entry.providerSession,
    providerSessionChanged: false
  })
    ? registryEntry?.launchConfig
    : undefined
  if (registryLaunchConfig) {
    return registryLaunchConfig
  }
  const sleepingRecord = state.sleepingAgentSessionsByPaneKey[entry.paneKey]
  return sleepingRecord?.launchConfig &&
    sleepingRecord.agent === entry.agentType &&
    entry.providerSession &&
    agentProviderSessionsEqual(
      entry.agentType,
      sleepingRecord.providerSession,
      entry.providerSession
    )
    ? sleepingRecord.launchConfig
    : undefined
}

// Why: the renderer twin of the main-process closedAgentStatusTabIds set that
// #7561 FIFO-capped. It suppresses late hook/status events for a just-closed tab,
// so it must outlive the tab briefly — but tabId is ephemeral and it was only
// ever added to, growing one entry per tab-close for the renderer's whole life.

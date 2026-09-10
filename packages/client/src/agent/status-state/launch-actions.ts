import {
  agentProviderSessionsEqual,
  getAgentResumeArgv,
  type SleepingAgentSessionRecord
} from '@agentstart/protocol/agent/session-resume'
import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { resolveAgentPaneAuthorityKey } from '../../terminal-pane/agent/pane-authority'
import {
  copyLaunchConfig,
  normalizeLaunchConfigRegistrationMetadata,
  launchConfigRegistryEntriesEqual,
  registryEntryMatchesStatus,
  getLaunchConfigForEntry
} from './launch-model'
import {
  getTabIdFromPaneKey,
  isRecentlyClosedAgentStatusTab,
  findAgentPaneWorktreeId
} from './retention-model'
import { sleepingRecordFromEntry } from './sleeping-model'
import type { AgentLaunchConfigRegistryEntry, AgentStatusSlice } from './slice'
import { removePaneKeys, getLaunchConfigForStatusMetadata } from './state-model'

export function createAgentStatusLaunchActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1],
  scheduleFreshness: () => void
): Pick<
  AgentStatusSlice,
  | 'registerAgentLaunchConfig'
  | 'getAgentLaunchConfigForStatusEntry'
  | 'getAgentLaunchConfigForStatusMetadata'
  | 'clearAgentLaunchConfig'
  | 'recordAgentProviderSession'
> {
  return {
    registerAgentLaunchConfig: (paneKey, launchConfig, metadata) => {
      set((s) => {
        const copiedLaunchConfig = copyLaunchConfig(launchConfig)
        const nextRegistryEntry: AgentLaunchConfigRegistryEntry = {
          launchConfig: copiedLaunchConfig,
          registeredAt: Date.now(),
          identity: normalizeLaunchConfigRegistrationMetadata(paneKey, metadata)
        }
        const existingRegistryEntry = s.agentLaunchConfigByPaneKey[paneKey]
        const registryChanged = !launchConfigRegistryEntriesEqual(
          existingRegistryEntry,
          nextRegistryEntry
        )
        const existingEntry = s.agentStatusByPaneKey[paneKey]
        const entryMatchesRegistry = registryEntryMatchesStatus({
          entry: nextRegistryEntry,
          paneKey,
          agentType: existingEntry?.agentType,
          tabId: existingEntry?.tabId ?? getTabIdFromPaneKey(paneKey) ?? undefined,
          terminalHandle: existingEntry?.terminalHandle,
          launchToken: metadata?.launchToken,
          providerSession: existingEntry?.providerSession,
          existingProviderSession: existingEntry?.providerSession,
          providerSessionChanged: false
        })
        const existingSleepingRecord = s.sleepingAgentSessionsByPaneKey[paneKey]
        let nextSleepingAgentSessions = s.sleepingAgentSessionsByPaneKey
        if (existingSleepingRecord && entryMatchesRegistry && existingEntry) {
          const worktreeId =
            existingEntry.worktreeId ??
            existingSleepingRecord.worktreeId ??
            findAgentPaneWorktreeId(s, paneKey)
          const refreshedRecord = worktreeId
            ? sleepingRecordFromEntry({
                state: s,
                entry: existingEntry,
                worktreeId,
                capturedAt: existingSleepingRecord.capturedAt,
                launchConfig: copiedLaunchConfig,
                origin: existingSleepingRecord.origin
              })
            : null
          if (refreshedRecord) {
            nextSleepingAgentSessions = {
              ...s.sleepingAgentSessionsByPaneKey,
              [paneKey]: {
                ...refreshedRecord,
                capturedAt: existingSleepingRecord.capturedAt
              }
            }
          }
        }
        if (!registryChanged && nextSleepingAgentSessions === s.sleepingAgentSessionsByPaneKey) {
          return s
        }
        return {
          ...(registryChanged
            ? {
                agentLaunchConfigByPaneKey: {
                  ...s.agentLaunchConfigByPaneKey,
                  [paneKey]: nextRegistryEntry
                }
              }
            : {}),
          ...(nextSleepingAgentSessions !== s.sleepingAgentSessionsByPaneKey
            ? { sleepingAgentSessionsByPaneKey: nextSleepingAgentSessions }
            : {})
        }
      })
    },
    getAgentLaunchConfigForStatusEntry: (entry) => getLaunchConfigForEntry(get(), entry),
    getAgentLaunchConfigForStatusMetadata: (metadata) =>
      getLaunchConfigForStatusMetadata(get(), metadata),
    clearAgentLaunchConfig: (paneKey) => {
      set((s) => {
        if (!(paneKey in s.agentLaunchConfigByPaneKey)) {
          return s
        }
        const nextLaunchConfigs = { ...s.agentLaunchConfigByPaneKey }
        delete nextLaunchConfigs[paneKey]
        return { agentLaunchConfigByPaneKey: nextLaunchConfigs }
      })
    },
    recordAgentProviderSession: (paneKey, agent, providerSession, timing, routing, metadata) => {
      paneKey = resolveAgentPaneAuthorityKey(paneKey)
      const updatedAt = timing?.updatedAt ?? Date.now()
      if (
        paneKey in get().recentlyRetiredAgentStatusPaneKeys ||
        isRecentlyClosedAgentStatusTab(
          get().recentlyClosedAgentStatusTabIds,
          getTabIdFromPaneKey(paneKey)
        ) ||
        !getAgentResumeArgv(agent, providerSession)
      ) {
        return
      }
      let removedLiveStatus = false
      set((s) => {
        const existingStatus = s.agentStatusByPaneKey[paneKey]
        const existingRecord = s.sleepingAgentSessionsByPaneKey[paneKey]
        if (
          (existingStatus && updatedAt < existingStatus.updatedAt) ||
          (existingRecord && updatedAt < existingRecord.updatedAt)
        ) {
          return s
        }
        const tabId = routing?.tabId ?? getTabIdFromPaneKey(paneKey) ?? existingRecord?.tabId
        const worktreeId =
          routing?.worktreeId ??
          existingStatus?.worktreeId ??
          existingRecord?.worktreeId ??
          findAgentPaneWorktreeId(s, paneKey)
        if (!worktreeId) {
          return s
        }
        const registryEntry = s.agentLaunchConfigByPaneKey[paneKey]
        const registryMatches = registryEntryMatchesStatus({
          entry: registryEntry,
          paneKey,
          agentType: agent,
          tabId,
          terminalHandle: undefined,
          launchToken: metadata?.launchToken,
          providerSession,
          existingProviderSession: existingRecord?.providerSession,
          providerSessionChanged: false
        })
        const launchConfig =
          (registryMatches ? registryEntry?.launchConfig : undefined) ??
          (existingRecord?.agent === agent &&
          agentProviderSessionsEqual(agent, existingRecord.providerSession, providerSession)
            ? existingRecord.launchConfig
            : undefined)
        const record: SleepingAgentSessionRecord = {
          paneKey,
          ...(tabId ? { tabId } : {}),
          worktreeId,
          agent,
          providerSession,
          prompt: '',
          // Why: this is durable process identity rather than visible turn
          // state; a non-done value keeps cold restore eligible.
          state: 'working',
          capturedAt: updatedAt,
          updatedAt,
          ...(existingStatus?.terminalTitle
            ? { terminalTitle: existingStatus.terminalTitle }
            : existingRecord?.terminalTitle
              ? { terminalTitle: existingRecord.terminalTitle }
              : {}),
          ...(routing?.connectionId !== undefined
            ? { connectionId: routing.connectionId }
            : existingRecord?.connectionId !== undefined
              ? { connectionId: existingRecord.connectionId }
              : {}),
          ...(launchConfig ? { launchConfig: copyLaunchConfig(launchConfig) } : {}),
          origin: 'live'
        }
        removedLiveStatus = existingStatus !== undefined
        const nextLive = removedLiveStatus ? { ...s.agentStatusByPaneKey } : s.agentStatusByPaneKey
        if (removedLiveStatus) {
          delete nextLive[paneKey]
        }
        const nextRetained =
          paneKey in s.retainedAgentsByPaneKey
            ? { ...s.retainedAgentsByPaneKey }
            : s.retainedAgentsByPaneKey
        if (nextRetained !== s.retainedAgentsByPaneKey) {
          delete nextRetained[paneKey]
        }
        // Why: identity mismatch invalidates both the durable launch config
        // and its ephemeral registry proof.
        let nextLaunchConfigs = s.agentLaunchConfigByPaneKey
        if (registryMatches && registryEntry) {
          nextLaunchConfigs = {
            ...nextLaunchConfigs,
            [paneKey]: {
              ...registryEntry,
              identity: { ...registryEntry.identity, providerSession }
            }
          }
        } else if (registryEntry) {
          nextLaunchConfigs = { ...nextLaunchConfigs }
          delete nextLaunchConfigs[paneKey]
        }
        return {
          agentStatusByPaneKey: nextLive,
          retainedAgentsByPaneKey: nextRetained,
          sleepingAgentSessionsByPaneKey: {
            ...s.sleepingAgentSessionsByPaneKey,
            [paneKey]: record
          },
          agentLaunchConfigByPaneKey: nextLaunchConfigs,
          acknowledgedAgentsByPaneKey: removePaneKeys(
            s.acknowledgedAgentsByPaneKey,
            new Set([paneKey])
          ),
          unreadAgentCompletionPanes: removePaneKeys(
            s.unreadAgentCompletionPanes,
            new Set([paneKey])
          ),
          agentStatusEpoch: removedLiveStatus ? s.agentStatusEpoch + 1 : s.agentStatusEpoch,
          sortEpoch: removedLiveStatus ? s.sortEpoch + 1 : s.sortEpoch
        }
      })
      if (removedLiveStatus) {
        queueMicrotask(() => scheduleFreshness())
      }
    }
  }
}

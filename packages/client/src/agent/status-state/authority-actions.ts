import type { AgentStatusEntry } from '@agentstart/protocol/agent/status-records'
import type { StateCreator } from 'zustand'
import {
  getAgentRowGeneratedTitleText,
  orchestrationLabelsMatchLiveDispatch
} from '~renderer/agent/row-primary-text'
import {
  retireAgentPaneAuthorityOnHost,
  transferAgentPaneAuthorityOnHost
} from '~renderer/runtime/agent-status-client'

import type { AppState } from '../../store/types'
import {
  resolveAgentPaneAuthorityKey,
  retireAgentPaneAuthorityAliases,
  transferAgentPaneAuthorityAlias
} from '../../terminal-pane/agent/pane-authority'
import { getTabIdFromPaneKey, getLeafIdFromPaneKey } from './retention-model'
import type { AgentStatusSlice } from './slice'
import {
  boundRecentlyRetiredAgentStatusPaneKeys,
  movePaneKeyedRecord,
  removePaneKeys,
  orchestrationMapsEqual,
  mergeCurrentOrchestrationContext
} from './state-model'

export function createAgentStatusAuthorityActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1],
  scheduleFreshness: () => void
): Pick<
  AgentStatusSlice,
  | 'retireAgentPaneAuthority'
  | 'transferAgentPaneAuthority'
  | 'setRuntimeAgentOrchestrationByPaneKey'
> {
  return {
    retireAgentPaneAuthority: (paneKey) => {
      const ownerPaneKey = resolveAgentPaneAuthorityKey(paneKey)
      const retiredPaneKeys = retireAgentPaneAuthorityAliases(paneKey)
      const retiredPaneKeySet = new Set(retiredPaneKeys)
      let hadLive = false
      set((s) => {
        const retiredLivePaneKeys = retiredPaneKeys.filter((key) => key in s.agentStatusByPaneKey)
        hadLive = retiredLivePaneKeys.length > 0
        let nextRetentionSuppressedPaneKeys = removePaneKeys(
          s.retentionSuppressedPaneKeys,
          retiredPaneKeySet
        )
        if (
          retiredLivePaneKeys.length > 0 &&
          nextRetentionSuppressedPaneKeys === s.retentionSuppressedPaneKeys
        ) {
          nextRetentionSuppressedPaneKeys = { ...nextRetentionSuppressedPaneKeys }
        }
        for (const key of retiredLivePaneKeys) {
          nextRetentionSuppressedPaneKeys[key] = true
        }
        return {
          agentStatusByPaneKey: removePaneKeys(s.agentStatusByPaneKey, retiredPaneKeySet),
          runtimeAgentOrchestrationByPaneKey: removePaneKeys(
            s.runtimeAgentOrchestrationByPaneKey,
            retiredPaneKeySet
          ),
          retainedAgentsByPaneKey: removePaneKeys(s.retainedAgentsByPaneKey, retiredPaneKeySet),
          sleepingAgentSessionsByPaneKey: removePaneKeys(
            s.sleepingAgentSessionsByPaneKey,
            retiredPaneKeySet
          ),
          agentLaunchConfigByPaneKey: removePaneKeys(
            s.agentLaunchConfigByPaneKey,
            retiredPaneKeySet
          ),
          acknowledgedAgentsByPaneKey: removePaneKeys(
            s.acknowledgedAgentsByPaneKey,
            retiredPaneKeySet
          ),
          paneForegroundAgentByPaneKey: removePaneKeys(
            s.paneForegroundAgentByPaneKey,
            retiredPaneKeySet
          ),
          unreadTerminalPanes: removePaneKeys(s.unreadTerminalPanes, retiredPaneKeySet),
          unreadAgentCompletionPanes: removePaneKeys(
            s.unreadAgentCompletionPanes,
            retiredPaneKeySet
          ),
          lastTerminalInputAtByPaneKey: removePaneKeys(
            s.lastTerminalInputAtByPaneKey,
            retiredPaneKeySet
          ),
          cacheTimerByKey: removePaneKeys(s.cacheTimerByKey, retiredPaneKeySet),
          retentionSuppressedPaneKeys: nextRetentionSuppressedPaneKeys,
          recentlyRetiredAgentStatusPaneKeys: boundRecentlyRetiredAgentStatusPaneKeys(
            s.recentlyRetiredAgentStatusPaneKeys,
            retiredPaneKeys
          ),
          agentStatusEpoch: hadLive ? s.agentStatusEpoch + 1 : s.agentStatusEpoch,
          sortEpoch: hadLive ? s.sortEpoch + 1 : s.sortEpoch
        }
      })
      if (hadLive) {
        queueMicrotask(() => scheduleFreshness())
      }
      if (typeof window !== 'undefined') {
        retireAgentPaneAuthorityOnHost(ownerPaneKey)
      }
    },
    transferAgentPaneAuthority: ({ fromPaneKey, toPaneKey, ptyId }) => {
      const transfer = transferAgentPaneAuthorityAlias({ fromPaneKey, toPaneKey, ptyId })
      if (!transfer || transfer.previousOwnerPaneKey === transfer.ownerPaneKey) {
        return
      }
      const from = transfer.previousOwnerPaneKey
      const to = transfer.ownerPaneKey
      const targetTabId = getTabIdFromPaneKey(to) ?? undefined
      const targetLeafId = getLeafIdFromPaneKey(to) ?? undefined
      set((s) => ({
        agentStatusByPaneKey: movePaneKeyedRecord(s.agentStatusByPaneKey, from, to, (entry) => ({
          ...entry,
          paneKey: to,
          tabId: targetTabId
        })),
        runtimeAgentOrchestrationByPaneKey: movePaneKeyedRecord(
          s.runtimeAgentOrchestrationByPaneKey,
          from,
          to
        ),
        retainedAgentsByPaneKey: movePaneKeyedRecord(
          s.retainedAgentsByPaneKey,
          from,
          to,
          (retained) => ({
            ...retained,
            entry: { ...retained.entry, paneKey: to, tabId: targetTabId },
            tab: targetTabId ? { ...retained.tab, id: targetTabId } : retained.tab
          })
        ),
        sleepingAgentSessionsByPaneKey: movePaneKeyedRecord(
          s.sleepingAgentSessionsByPaneKey,
          from,
          to,
          (record) => ({ ...record, paneKey: to, tabId: targetTabId })
        ),
        agentLaunchConfigByPaneKey: movePaneKeyedRecord(
          s.agentLaunchConfigByPaneKey,
          from,
          to,
          (entry) => ({
            ...entry,
            identity: { ...entry.identity, tabId: targetTabId, leafId: targetLeafId }
          })
        ),
        acknowledgedAgentsByPaneKey: movePaneKeyedRecord(s.acknowledgedAgentsByPaneKey, from, to),
        paneForegroundAgentByPaneKey: movePaneKeyedRecord(s.paneForegroundAgentByPaneKey, from, to),
        unreadTerminalPanes: movePaneKeyedRecord(s.unreadTerminalPanes, from, to),
        unreadAgentCompletionPanes: movePaneKeyedRecord(s.unreadAgentCompletionPanes, from, to),
        lastTerminalInputAtByPaneKey: movePaneKeyedRecord(s.lastTerminalInputAtByPaneKey, from, to),
        cacheTimerByKey: movePaneKeyedRecord(s.cacheTimerByKey, from, to),
        retentionSuppressedPaneKeys: movePaneKeyedRecord(s.retentionSuppressedPaneKeys, from, to)
      }))
      if (typeof window !== 'undefined') {
        transferAgentPaneAuthorityOnHost({
          fromPaneKey: from,
          toPaneKey: to,
          ...(transfer.ptyId ? { ptyId: transfer.ptyId } : {})
        })
      }
    },
    setRuntimeAgentOrchestrationByPaneKey: (entries) => {
      const generatedTitleUpdates: AgentStatusEntry[] = []
      set((s) => {
        const runtimeMapChanged = !orchestrationMapsEqual(
          s.runtimeAgentOrchestrationByPaneKey,
          entries
        )
        let nextLive = s.agentStatusByPaneKey
        let liveChanged = false
        let nextRetained = s.retainedAgentsByPaneKey
        let retainedChanged = false

        for (const [paneKey, runtimeOrchestration] of Object.entries(entries)) {
          const liveEntry = nextLive[paneKey]
          if (liveEntry) {
            const merged = mergeCurrentOrchestrationContext(
              liveEntry.orchestration,
              runtimeOrchestration
            )
            if (merged !== liveEntry.orchestration) {
              if (!liveChanged) {
                nextLive = { ...nextLive }
                liveChanged = true
              }
              const nextEntry = { ...liveEntry, orchestration: merged }
              nextLive[paneKey] = nextEntry
              // Why: only replace titles when labels match the live dispatch
              // taskId; sticky completed context must not rename a later turn.
              if (
                (merged.displayName?.trim() || merged.taskTitle?.trim()) &&
                orchestrationLabelsMatchLiveDispatch({
                  prompt: nextEntry.prompt,
                  orchestration: merged
                })
              ) {
                generatedTitleUpdates.push(nextEntry)
              }
            }
          }

          const retainedEntry = nextRetained[paneKey]
          if (retainedEntry) {
            const merged = mergeCurrentOrchestrationContext(
              retainedEntry.entry.orchestration,
              runtimeOrchestration
            )
            if (merged !== retainedEntry.entry.orchestration) {
              if (!retainedChanged) {
                nextRetained = { ...nextRetained }
                retainedChanged = true
              }
              nextRetained[paneKey] = {
                ...retainedEntry,
                entry: { ...retainedEntry.entry, orchestration: merged }
              }
            }
          }
        }

        if (!runtimeMapChanged && !liveChanged && !retainedChanged) {
          return s
        }

        return {
          ...(runtimeMapChanged ? { runtimeAgentOrchestrationByPaneKey: entries } : {}),
          ...(liveChanged ? { agentStatusByPaneKey: nextLive } : {}),
          ...(retainedChanged ? { retainedAgentsByPaneKey: nextRetained } : {}),
          ...(liveChanged ? { agentStatusEpoch: s.agentStatusEpoch + 1 } : {})
        }
      })
      for (const entry of generatedTitleUpdates) {
        get().setGeneratedTabTitleFromAgentPrompt(
          entry.paneKey,
          getAgentRowGeneratedTitleText(entry),
          {
            replaceExistingGeneratedTitle: true
          }
        )
      }
    }
  }
}

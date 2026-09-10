import type { AgentStatusEntry } from '@agentstart/protocol/agent/status-records'
import type { StateCreator } from 'zustand'
import {
  getAgentRowGeneratedTitleText,
  getAgentStartDispatchTaskId,
  isAgentStartDispatchPrompt,
  orchestrationLabelsMatchLiveDispatch
} from '~renderer/agent/row-primary-text'

import type { AppState } from '../../store/types'
import { resolveAgentPaneAuthorityKey } from '../../terminal-pane/agent/pane-authority'
import { resolveLiveAgentStatusEntry } from './live-entry'
import { buildLiveAgentStatusPatch } from './live-patch'
import {
  getTabIdFromPaneKey,
  agentStatusTabAlreadyHasProtectedOrGeneratedTitle,
  isRecentlyClosedAgentStatusTab
} from './retention-model'
import type { AgentStatusSlice } from './slice'

export function createAgentStatusLiveActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1],
  scheduleFreshness: () => void
): Pick<AgentStatusSlice, 'setAgentStatus'> {
  return {
    setAgentStatus: (paneKey, payload, terminalTitle, timing, routing, metadata) => {
      paneKey = resolveAgentPaneAuthorityKey(paneKey)
      const updatedAt = timing?.updatedAt ?? Date.now()
      if (
        paneKey in get().recentlyRetiredAgentStatusPaneKeys ||
        // Why: a closed terminal tab is no longer a valid destination for hook
        // replays or late status events, even if main still receives them.
        isRecentlyClosedAgentStatusTab(
          get().recentlyClosedAgentStatusTabIds,
          getTabIdFromPaneKey(paneKey)
        )
      ) {
        return
      }
      const appliedResult: {
        current: {
          entry: AgentStatusEntry
          completionRefreshWorktreeId: string | null
        } | null
      } = { current: null }
      let suppressedInheritedTerminalStatus = false
      set((state) => {
        const resolution = resolveLiveAgentStatusEntry({
          state,
          paneKey,
          payload,
          terminalTitle,
          timing,
          routing,
          metadata,
          updatedAt
        })
        if (resolution.status === 'ignored') {
          return state
        }
        if (resolution.status === 'suppressed') {
          suppressedInheritedTerminalStatus = true
          return state
        }
        const result = buildLiveAgentStatusPatch({
          state,
          paneKey,
          payload,
          updatedAt,
          resolution
        })
        appliedResult.current = {
          entry: resolution.entry,
          completionRefreshWorktreeId: result.completionRefreshWorktreeId
        }
        return result.patch
      })
      if (suppressedInheritedTerminalStatus) {
        return
      }
      const entryForGeneratedTitle = appliedResult.current?.entry ?? null
      if (entryForGeneratedTitle) {
        // Why: sticky orchestration (~30m) can outlive the dispatch turn.
        // - Matching labels: replace so displayName upgrades the task preview.
        // - Mismatched sticky taskId on a new dispatch preamble: replace so the
        //   prior task's title does not stick across re-dispatch on the same pane.
        const hasMatchingOrchestrationLabels = Boolean(
          (entryForGeneratedTitle.orchestration?.displayName?.trim() ||
            entryForGeneratedTitle.orchestration?.taskTitle?.trim()) &&
          orchestrationLabelsMatchLiveDispatch(entryForGeneratedTitle)
        )
        const liveIsDispatchPrompt = isAgentStartDispatchPrompt(entryForGeneratedTitle.prompt)
        const liveDispatchTaskId = liveIsDispatchPrompt
          ? getAgentStartDispatchTaskId(entryForGeneratedTitle.prompt)
          : null
        const stickyOrchestrationTaskId =
          entryForGeneratedTitle.orchestration?.taskId?.trim() || null
        const isNewDispatchAgainstStickyOrchestration = Boolean(
          liveDispatchTaskId &&
          stickyOrchestrationTaskId &&
          liveDispatchTaskId !== stickyOrchestrationTaskId
        )
        const shouldReplaceGeneratedTitle =
          hasMatchingOrchestrationLabels || isNewDispatchAgainstStickyOrchestration
        // Why: setAgentStatus is high-frequency. Only parse dispatch preambles when
        // a title write is still possible (feature on + replace or first-write).
        const mayWriteGeneratedTitle =
          get().settings?.tabAutoGenerateTitle === true &&
          (shouldReplaceGeneratedTitle ||
            !agentStatusTabAlreadyHasProtectedOrGeneratedTitle(
              get(),
              entryForGeneratedTitle.tabId ?? getTabIdFromPaneKey(paneKey),
              entryForGeneratedTitle.worktreeId
            ))
        const generatedTitlePrompt =
          liveIsDispatchPrompt && mayWriteGeneratedTitle
            ? getAgentRowGeneratedTitleText(entryForGeneratedTitle)
            : entryForGeneratedTitle.prompt
        if (shouldReplaceGeneratedTitle) {
          get().setGeneratedTabTitleFromAgentPrompt(paneKey, generatedTitlePrompt, {
            replaceExistingGeneratedTitle: true
          })
        } else {
          get().setGeneratedTabTitleFromAgentPrompt(paneKey, generatedTitlePrompt)
        }
      }
      // Why: schedule after set completes so the timer reads the updated map.
      // queueMicrotask avoids re-entry into the zustand store during set.
      queueMicrotask(() => scheduleFreshness())
      if (appliedResult.current?.completionRefreshWorktreeId) {
        const worktreeId = appliedResult.current.completionRefreshWorktreeId
        // Why: agents can create a PR via `gh pr create`, bypassing AgentStart's
        // create-PR flow and leaving a fresh "no PR" cache entry in place.
        queueMicrotask(() => get().refreshGitHubForWorktreeIfStale(worktreeId))
      }
    }
  }
}

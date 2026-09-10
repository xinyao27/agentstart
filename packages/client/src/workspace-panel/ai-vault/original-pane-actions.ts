import type { AgentStatusState } from '@agentstart/protocol/agent/status-records'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { activateTabAndFocusPane } from '~renderer/tab-bar/activate-and-focus-pane'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { findOriginalAiVaultSessionPane } from './original-pane'
import {
  createLazyAiVaultOriginalPaneIndex,
  findAiVaultSessionLiveStateInIndex,
  findOriginalAiVaultSessionPaneInIndex
} from './original-pane-index'

export function useAiVaultOriginalPaneActions(): {
  getOriginalPaneTarget: (
    session: AiVaultSession
  ) => ReturnType<typeof findOriginalAiVaultSessionPane>
  getSessionLiveState: (session: AiVaultSession) => AgentStatusState | null
  jumpToOriginalPane: (session: AiVaultSession) => void
  jumpToWorktree: (worktreeId: string) => void
} {
  const originalPaneLookupState = useAppStore(
    useShallow((s) => ({
      agentStatusByPaneKey: s.agentStatusByPaneKey,
      retainedAgentsByPaneKey: s.retainedAgentsByPaneKey,
      sleepingAgentSessionsByPaneKey: s.sleepingAgentSessionsByPaneKey,
      tabsByWorktree: s.tabsByWorktree,
      terminalLayoutsByTabId: s.terminalLayoutsByTabId
    }))
  )
  // Why: loading, filtered, or collapsed views may render no session rows.
  // Build once on the first actual lookup, then share it across visible rows.
  const getOriginalPaneIndex = (() => createLazyAiVaultOriginalPaneIndex(originalPaneLookupState))()

  const getOriginalPaneTarget = (session: AiVaultSession) =>
    findOriginalAiVaultSessionPaneInIndex(getOriginalPaneIndex(), session)

  const getSessionLiveState = (session: AiVaultSession) =>
    findAiVaultSessionLiveStateInIndex(getOriginalPaneIndex(), session)

  const jumpToOriginalPane = (session: AiVaultSession): void => {
    const target = findOriginalAiVaultSessionPane(useAppStore.getState(), session)
    if (!target) {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.originalPaneUnavailable',
          'Original pane is no longer available.'
        )
      )
      return
    }

    if (!activateAndRevealWorktree(target.worktreeId)) {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.worktreeUnavailable',
          'Worktree is no longer available.'
        )
      )
      return
    }
    const state = useAppStore.getState()
    state.setActiveTabType('terminal')
    activateTabAndFocusPane(target.tabId, target.leafId, {
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
  }

  const jumpToWorktree = (worktreeId: string): void => {
    if (!activateAndRevealWorktree(worktreeId)) {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.worktreeUnavailable',
          'Worktree is no longer available.'
        )
      )
    }
  }

  return { getOriginalPaneTarget, getSessionLiveState, jumpToOriginalPane, jumpToWorktree }
}

import type { AgentStatusEntry } from '@agentstart/protocol/agent/status-records'
import { parseSshPtyId } from '@agentstart/protocol/terminal-identity'
import { getConnectionIdFromState } from '~renderer/runtime/connection-context'
import { useAppStore } from '~renderer/store/state'
import { dispatchTerminalCommandFinishedEvent } from '~renderer/terminal/command-finished-event'

import {
  cancelCommandCodeDoneSettle,
  openCommandCodeDoneSettle,
  setCommandCodeDoneSettleExecutor
} from './command-code-done-settle'

export function createParkedTerminalCommandStatusPolicy(options: {
  ptyId: string
  worktreeId: string
  tabId: string
  paneId: number
  paneKey: string
}): {
  onCommandFinished: (bestEffortExitCode: number | null) => void
  onCommandCodeWorking: (prompt: string) => void
  onCommandCodeDone: (prompt: string) => void
  dispose: () => void
} {
  const { ptyId, worktreeId, tabId, paneId, paneKey } = options
  let disposed = false

  const resolveRouting = (): {
    tabId: string
    worktreeId: string
    connectionId: string | null
  } | null => {
    if (disposed) {
      return null
    }
    const connectionId = getConnectionIdFromState(useAppStore.getState(), worktreeId)
    return connectionId === undefined ? null : { tabId, worktreeId, connectionId }
  }

  const dropCommandFinishedStatusIfSameTurn = (entry: AgentStatusEntry | undefined): void => {
    const state = useAppStore.getState()
    if (!entry) {
      state.clearAgentLaunchConfig(paneKey)
      return
    }
    const current = state.agentStatusByPaneKey[paneKey]
    if (!current) {
      state.clearAgentLaunchConfig(paneKey)
      return
    }
    if (
      current.state === entry.state &&
      current.prompt === entry.prompt &&
      current.updatedAt === entry.updatedAt &&
      current.stateStartedAt === entry.stateStartedAt &&
      current.agentType === entry.agentType
    ) {
      state.dropAgentStatus(paneKey)
    }
  }

  const settleCommandCodeDone = (normalizedPrompt: string): void => {
    const routing = resolveRouting()
    if (!routing) {
      return
    }
    const state = useAppStore.getState()
    const current = state.agentStatusByPaneKey[paneKey]
    if (current?.agentType !== 'command-code' || current.state !== 'working') {
      return
    }
    const currentPrompt = current.prompt.trim()
    if (currentPrompt && currentPrompt !== normalizedPrompt) {
      return
    }
    const currentTitle = state.runtimePaneTitlesByTabId[tabId]?.[paneId]
    state.setAgentStatus(
      paneKey,
      {
        state: 'done',
        prompt: currentPrompt || normalizedPrompt,
        agentType: 'command-code'
      },
      currentTitle,
      undefined,
      routing
    )
  }

  const releaseDoneSettleExecutor = setCommandCodeDoneSettleExecutor(paneKey, settleCommandCodeDone)

  return {
    onCommandFinished: (): void => {
      if (disposed) {
        return
      }
      dispatchTerminalCommandFinishedEvent(worktreeId)
      if (parseSshPtyId(ptyId) !== null) {
        dropCommandFinishedStatusIfSameTurn(useAppStore.getState().agentStatusByPaneKey[paneKey])
      }
    },
    onCommandCodeWorking: (prompt): void => {
      cancelCommandCodeDoneSettle(paneKey)
      const routing = resolveRouting()
      if (!routing) {
        return
      }
      const state = useAppStore.getState()
      const current = state.agentStatusByPaneKey[paneKey]
      const normalizedPrompt = prompt.trim()
      if (
        current?.agentType === 'command-code' &&
        current.state === 'done' &&
        (!normalizedPrompt || normalizedPrompt === current.prompt.trim())
      ) {
        return
      }
      state.setAgentStatus(
        paneKey,
        {
          state: 'working',
          prompt: normalizedPrompt || (current?.state === 'working' ? current.prompt : ''),
          agentType: 'command-code'
        },
        state.runtimePaneTitlesByTabId[tabId]?.[paneId],
        undefined,
        routing
      )
    },
    onCommandCodeDone: (prompt): void => {
      const normalizedPrompt = prompt.trim()
      if (!normalizedPrompt) {
        cancelCommandCodeDoneSettle(paneKey)
        return
      }
      openCommandCodeDoneSettle(paneKey, normalizedPrompt)
    },
    dispose: (): void => {
      releaseDoneSettleExecutor()
      disposed = true
    }
  }
}

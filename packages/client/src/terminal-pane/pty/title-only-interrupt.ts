import { detectAgentStatusFromTitle } from '~renderer/agent/title/status'
import { useAppStore } from '~renderer/store/state'
import { AGENT_INTERRUPT_SETTLE_MS } from '~renderer/terminal-pane/agent/interrupt-intent'

type TitleOnlyInterruptOptions = {
  paneKey: string
  tabId: string
  worktreeId: string
  paneId: number
  getNeutralTitle: () => string
  getIsActivePane: () => boolean
  setRuntimePaneTitle: (title: string) => void
  updateTabTitle: (title: string) => void
}

export type TitleOnlyInterrupt = {
  clearInferredWorkingTitle: () => void
  observe: () => void
  dispose: () => void
}

export function createTitleOnlyInterrupt(options: TitleOnlyInterruptOptions): TitleOnlyInterrupt {
  let timer: ReturnType<typeof setTimeout> | null = null

  const getCurrentTitle = (): string | null => {
    const state = useAppStore.getState()
    const runtimeTitle = state.runtimePaneTitlesByTabId?.[options.tabId]?.[options.paneId]
    const tabTitle = (state.tabsByWorktree[options.worktreeId] ?? []).find(
      (entry) => entry.id === options.tabId
    )?.title
    return runtimeTitle ?? tabTitle ?? null
  }

  const dispose = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const clearInferredWorkingTitle = (): void => {
    const state = useAppStore.getState()
    const title =
      state.runtimePaneTitlesByTabId?.[options.tabId]?.[options.paneId] ??
      state.agentStatusByPaneKey[options.paneKey]?.terminalTitle
    if (!title) {
      return
    }
    const neutralTitle = options.getNeutralTitle()
    options.setRuntimePaneTitle(neutralTitle)
    if (options.getIsActivePane()) {
      options.updateTabTitle(neutralTitle)
    }
  }

  return {
    clearInferredWorkingTitle,
    observe: () => {
      if (useAppStore.getState().agentStatusByPaneKey[options.paneKey]) {
        return
      }
      const baselineTitle = getCurrentTitle()
      if (detectAgentStatusFromTitle(baselineTitle ?? '') !== 'working') {
        return
      }
      dispose()
      timer = setTimeout(() => {
        timer = null
        if (useAppStore.getState().agentStatusByPaneKey[options.paneKey]) {
          return
        }
        const currentTitle = getCurrentTitle()
        if (
          currentTitle === baselineTitle &&
          detectAgentStatusFromTitle(currentTitle ?? '') === 'working'
        ) {
          // Why: title-only agents can miss their idle title after Ctrl+C.
          // Clear only an unchanged, acknowledged working title.
          clearInferredWorkingTitle()
        }
      }, AGENT_INTERRUPT_SETTLE_MS)
    },
    dispose
  }
}

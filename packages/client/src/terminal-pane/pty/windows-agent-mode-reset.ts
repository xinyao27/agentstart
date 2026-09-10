import type { AgentType } from '@agentstart/protocol/agent/status-records'
import { useAppStore } from '~renderer/store/state'

type WindowsAgentModeResetOptions = {
  isEnabled: boolean
  paneKey: string
  onDone: (agentType: AgentType | undefined, didTransition: boolean) => void
  onActive: () => void
}

export function installWindowsAgentModeReset(options: WindowsAgentModeResetOptions): () => void {
  if (!options.isEnabled) {
    return () => {}
  }
  const initialStatus = useAppStore.getState().agentStatusByPaneKey[options.paneKey]
  let lastState = initialStatus?.state
  if (initialStatus?.state === 'done') {
    options.onDone(initialStatus.agentType, false)
  }
  return useAppStore.subscribe((state) => {
    const nextStatus = state.agentStatusByPaneKey[options.paneKey]
    const nextState = nextStatus?.state
    if (nextState === 'done') {
      options.onDone(nextStatus.agentType, lastState !== 'done')
    } else if (nextState) {
      options.onActive()
    }
    lastState = nextState
  })
}

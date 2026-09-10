import { makePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'

function dismissStaleAgentRowByKey(paneKey: string): void {
  const store = useAppStore.getState()
  const liveExisted = paneKey in store.agentStatusByPaneKey
  const retainedExisted = paneKey in store.retainedAgentsByPaneKey
  store.dropAgentStatus(paneKey)
  store.dismissRetainedAgent(paneKey)
  if (liveExisted || retainedExisted) {
    toast.info(
      translate(
        'auto.components.terminal.pane.stale.agent.row.ad991ece5c',
        "Agent's pane is no longer available."
      ),
      {
        id: translate(
          'auto.components.terminal.pane.stale.agent.row.090d607412',
          'stale-agent-row-{{value0}}',
          { value0: paneKey }
        )
      }
    )
  }
}

export function surfaceStaleAgentRow(tabId: string, leafId: string): void {
  dismissStaleAgentRowByKey(makePaneKey(tabId, leafId))
}

import { agentPhaseLabel } from '~renderer/agent-session/phase'
import { useAgentPresence } from '~renderer/agent-session/presence'
import { translate } from '~renderer/i18n/i18n'
import { MonitorArrowUp } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
export function AgentMonitor(): React.JSX.Element | null {
  const { active } = useAgentPresence()
  if (active.length === 0) {
    return null
  }
  const body = active
    .map((terminal) =>
      translate('extension.agent.monitorRow', '{{title}} — {{phase}}', {
        phase: agentPhaseLabel(terminal.phase),
        title: terminal.title ?? translate('extension.agent.untitled', 'Agent')
      })
    )
    .join('\n')
  const open = (): void => {
    void getExtensionBrowserCapabilities().openAgentMonitor({
      body,
      title: translate('extension.agent.monitorTitle', 'AgentStart agent monitor')
    })
  }
  return (
    <section className="border-sidebar-border border-b p-2">
      <Button type="button" size="xs" variant="outline" onClick={open}>
        <MonitorArrowUp />
        {translate('extension.agent.openMonitor', 'Open floating agent monitor')}
      </Button>
    </section>
  )
}

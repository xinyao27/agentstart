import type { TuiAgent } from '@yiru/protocol/agent/types'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { track, tuiAgentToAgentKind } from '~renderer/telemetry/client'

export function showAgentPromptNotSentToast(agent: TuiAgent): void {
  toast.message(
    translate(
      'auto.lib.launch.agent.background.session.4ca0651d56',
      "Your agent prompt wasn't sent — open the workspace and paste it."
    )
  )
  track('agent_error', {
    error_class: 'paste_readiness_timeout',
    agent_kind: tuiAgentToAgentKind(agent)
  })
}

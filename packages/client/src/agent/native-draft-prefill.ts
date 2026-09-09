import { TUI_AGENT_CONFIG } from '@yiru/protocol/agent/launch/config'
import type { TuiAgent } from '@yiru/protocol/agent/types'

// Why: agents with a native draft-prefill flag/env launch with the prompt
// already in their input box, so the paste helpers intentionally no-op (return
// false) unless `forcePaste` overrides. Callers use this to tell "delivered
// natively" apart from a real paste failure.
export function agentDeliversDraftViaNativePrefill(
  agent: TuiAgent | undefined,
  forcePaste: boolean | undefined
): boolean {
  if (forcePaste) {
    return false
  }
  const agentConfig = agent ? TUI_AGENT_CONFIG[agent] : null
  return Boolean(agentConfig?.draftPromptFlag || agentConfig?.draftPromptEnvVar)
}

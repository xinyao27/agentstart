import type { AgentPhase } from '@agentstart/protocol/agent/phase'
import { agentPhaseLabel } from '~renderer/agent-session/phase'

// Why: the browser's tab group already names the project, so the tab itself is
// the only place the worktree can show — otherwise every tab of every worktree
// reads as the same product name.
export function composeDocumentTitle(args: {
  phase: AgentPhase | null
  productName: string
  worktreeName: string | null
}): string {
  const identity = args.worktreeName?.trim() || args.productName
  return args.phase ? `${agentPhaseLabel(args.phase)} · ${identity}` : identity
}

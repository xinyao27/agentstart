import type { AgentPhase } from '@agentstart/protocol/agent/phase'
import { agentPhaseLabel } from '~renderer/agent-session/phase'

// Why: the browser's tab group already names the project, so the tab itself
// carries the selected workbench tab — the task actually in flight — and falls
// back to the worktree only when the strip has no selection to report.
export function composeDocumentTitle(args: {
  phase: AgentPhase | null
  productName: string
  tabTitle: string | null
  worktreeName: string | null
}): string {
  const identity = args.tabTitle?.trim() || args.worktreeName?.trim() || args.productName
  return args.phase ? `${agentPhaseLabel(args.phase)} · ${identity}` : identity
}

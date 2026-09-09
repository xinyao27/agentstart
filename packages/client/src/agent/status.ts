import type { AgentType } from '@yiru/protocol/agent/status-records'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import { tuiAgentToAgentKind } from '@yiru/protocol/telemetry/agent-kind'
import type { AgentKind } from '@yiru/protocol/telemetry/events/foundations'

// Why: AgentIcon expects a TuiAgent, but AgentType is a broader union
// (WellKnownAgentType | (string & {})) that includes 'unknown' and arbitrary
// strings reported by hook payloads. Return null for the unknown case so
// AgentIcon renders a neutral "?" glyph — using 'claude' as a fallback
// caused Codex panes to briefly show the Claude icon before the hook fired.
// Why: we also guard against arbitrary strings (e.g. a hook reporting
// agentType: "weirdo") by checking membership in an explicit record. A
// blind `as TuiAgent` cast would pass values through that AgentIcon can't
// render, producing a broken icon or falling back to an unrelated glyph.
// Why: modeled as `Record<TuiAgent, true>` rather than a Set so the TypeScript
// compiler fails to build when a TuiAgent member is added to shared/types.ts
// without being added here — a Set<TuiAgent> is structurally permissive and
// would silently accept a subset of the union.
const ICONABLE_AGENT_TYPES: Record<TuiAgent, true> = {
  claude: true,
  openclaude: true,
  codex: true,
  autohand: true,
  opencode: true,
  'mimo-code': true,
  pi: true,
  omp: true,
  gemini: true,
  antigravity: true,
  aider: true,
  goose: true,
  amp: true,
  kilo: true,
  kiro: true,
  crush: true,
  aug: true,
  cline: true,
  codebuff: true,
  'command-code': true,
  continue: true,
  cursor: true,
  droid: true,
  kimi: true,
  'mistral-vibe': true,
  'qwen-code': true,
  rovo: true,
  hermes: true,
  openclaw: true,
  copilot: true,
  grok: true,
  devin: true,
  ante: true,
  trae: true
}

export function agentTypeToIconAgent(agentType: AgentType | null | undefined): TuiAgent | null {
  if (!agentType || agentType === 'unknown') {
    return null
  }
  return Object.prototype.hasOwnProperty.call(ICONABLE_AGENT_TYPES, agentType)
    ? (agentType as TuiAgent)
    : null
}

// Why: telemetry's `agent_kind` enum derives from the TuiAgent mapping. Share
// one resolver so the notes-send dropdown and the sidebar send path stamp
// identical agent_kind values on `agent_prompt_sent`.
export function agentKindForAgentType(agentType: AgentType | null | undefined): AgentKind {
  const tuiAgent = agentTypeToIconAgent(agentType)
  return tuiAgent ? tuiAgentToAgentKind(tuiAgent) : 'other'
}

// Why: the freshness gate moved into the pane-agent-evidence resolvers; the
// re-export keeps this module's many existing importers unchanged.
export { isExplicitAgentStatusFresh } from '../terminal-pane/agent/evidence'

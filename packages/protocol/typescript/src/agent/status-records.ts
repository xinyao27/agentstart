import type { AgentProviderSessionMetadata } from './session-resume.js'

export const AGENT_STATUS_STATES = ['working', 'blocked', 'waiting', 'done'] as const
export type AgentStatusState = (typeof AGENT_STATUS_STATES)[number]
// Why: agent types are not restricted to a fixed set — new agents appear
// regularly and users may run custom agents. Any non-empty string is accepted;
// well-known names are kept as a convenience union for internal code that
// wants to pattern-match on common agents.
export type WellKnownAgentType =
  | 'claude'
  | 'openclaude'
  | 'codex'
  | 'gemini'
  | 'antigravity'
  | 'amp'
  | 'opencode'
  | 'mimo-code'
  | 'cursor'
  | 'copilot'
  | 'aider'
  | 'pi'
  | 'omp'
  | 'droid'
  | 'command-code'
  | 'grok'
  | 'hermes'
  | 'devin'
  | 'ante'
  | 'trae'
  | 'unknown'
export type AgentType = WellKnownAgentType | (string & {})

/** A snapshot of a previous agent state, used to render activity blocks.
 *  Why: intentionally narrower than AgentStatusEntry — omits toolName,
 *  toolInput, and lastAssistantMessage. History rows record what STATE the
 *  agent was in and what PROMPT was being handled; tool context is
 *  per-event/per-turn and doesn't meaningfully apply to a historical state
 *  snapshot. Carrying tool/assistant payloads on every transition would also
 *  bloat memory on long sessions (capped at AGENT_STATE_HISTORY_MAX entries
 *  per agent). The current state's tool/assistant fields live on
 *  AgentStatusEntry only, and activity-block rendering intentionally shows
 *  state + prompt + duration summaries rather than tool traces. */
export type AgentStateHistoryEntry = {
  state: AgentStatusState
  prompt: string
  /** When this state was first reported. */
  startedAt: number
  /** True when this `done` was a cancellation. May come from an agent hook
   *  (for example Claude Code `is_interrupt`) or AgentStart's guarded interrupt
   *  fallback. Always falsy for non-`done` states, so retention logic can
   *  preserve this signal. */
  interrupted?: boolean
}

/** Maximum number of history entries kept per agent to bound memory. */
export const AGENT_STATE_HISTORY_MAX = 20

export type AgentStatusOrchestrationContext = {
  taskId: string
  dispatchId: string
  taskTitle?: string
  displayName?: string
  parentTerminalHandle?: string
  parentPaneKey?: string
  coordinatorHandle?: string
  orchestrationRunId?: string
}

export type AgentSubagentState = 'working' | 'blocked' | 'waiting' | 'idle'

/** A live in-process child spawned by the pane's provider session. Rendered as
 *  an indented child row under the owning pane's sidebar row — these children
 *  have no PTY of their own. */
export type AgentSubagentSnapshot = {
  /** Provider-assigned lifecycle id. */
  id: string
  agentType?: string
  /** Provider model used by this child, when exposed by its lifecycle event. */
  model?: string
  description?: string
  state: AgentSubagentState
  /** Timestamp (ms) when this subagent was first observed. */
  startedAt: number
}

export type AgentStatusEntry = {
  state: AgentStatusState
  /** The user's most recent prompt, when the hook payload carried one.
   *  Cached across the turn — subsequent tool-use events in the same turn do
   *  not include the prompt, so the renderer receives the last known value
   *  until a new prompt arrives or the pane resets. Empty when unknown. */
  prompt: string
  /** Timestamp (ms) of the last status update. */
  updatedAt: number
  /** Timestamp (ms) when the current `state` was first reported.
   *  Why: separate from updatedAt so stateHistory[].startedAt reflects when
   *  the state was first reported, not the most recent within-state update
   *  (tool/prompt pings reset updatedAt but not stateStartedAt). */
  stateStartedAt: number
  agentType?: AgentType
  /** Provider model currently used by this session. */
  model?: string
  /** Composite key: `${tabId}:${leafId}` where leafId is a stable UUID layout leaf. */
  paneKey: string
  /** Runtime terminal handle for matching retained parent rows when the parent
   *  pane key cannot be re-derived after terminal teardown. */
  terminalHandle?: string
  /** Worktree attribution stamped by main when a hook can be resolved there.
   *  Why: orchestration workers can report status before their terminal tab is
   *  present in a renderer; retaining this lets worktree-level UI still show
   *  the live child agent instead of dropping it as unattributed. */
  worktreeId?: string
  /** Tab attribution from the hook IPC payload, when available. */
  tabId?: string
  /** Execution host owning this status. Null is local; a string identifies an
   *  SSH/remote connection and keeps persisted resume routing host-correct. */
  connectionId?: string | null
  terminalTitle?: string
  /** Rolling log of previous states. Each entry records a state the agent was in
   *  before transitioning to the current one. Capped at AGENT_STATE_HISTORY_MAX. */
  stateHistory: AgentStateHistoryEntry[]
  /** Name of the tool the agent is currently using (e.g. "Edit", "Bash"). */
  toolName?: string
  /** Short preview of the tool input (e.g. file path, command). */
  toolInput?: string
  /** JSON string of the AskUserQuestion tool input (`{ questions: [...] }`),
   *  captured live when the agent calls AskUserQuestion. Unlike toolInput this
   *  is NOT truncated to a short preview — clients render the full structured
   *  prompt as a live card. Cleared (undefined) once the agent moves on to a
   *  different tool or state so a stale prompt doesn't linger. */
  interactivePrompt?: string
  /** Most recent assistant message preview, when the hook carried one. */
  lastAssistantMessage?: string
  /** True when the current `done` state was reached via an interrupt rather
   *  than a normal turn completion. May be reported by the agent itself or
   *  inferred by AgentStart's guarded interrupt fallback.
   *  Orthogonal to `state`: the agent still finished the turn, but the user
   *  cancelled it. Undefined while the agent is working or when no interrupt
   *  signal was available. */
  interrupted?: boolean
  /** Orchestration dispatch context for agent panes spawned by another agent.
   *  Why: parent/child agent hierarchy is pane-level state, not worktree
   *  lineage; workers often run in the same worktree as their coordinator. */
  orchestration?: AgentStatusOrchestrationContext
  /** Live in-process subagents/teammates of this pane's session. Absent when
   *  none are tracked; the sidebar derives indented child rows from it. */
  subagents?: AgentSubagentSnapshot[]
  /** Provider-owned conversation/session id captured from hook payloads.
   *  Used only for exact CLI resume; AgentStart terminal ids are not agent-session ids. */
  providerSession?: AgentProviderSessionMetadata
  /** Live-only Command Code turn boundary key; not persisted to last-status.json. */
  promptInteractionKey?: string
}

export type MigrationUnsupportedPtyEntry = {
  ptyId: string
  worktreeId?: string
  tabId?: string
  leafId?: string
  /** Registry-backed UUID pane proof, when available. */
  paneKey?: string
  reason: 'legacy-numeric-pane-key'
  source: 'local' | 'ssh'
  updatedAt: number
}

// ─── Agent status payload shape (what hook receivers send via IPC) ──────────
// Hook integrations only need to provide normalized state fields. The
// remaining AgentStatusEntry fields (updatedAt, paneKey, etc.) are populated
// by the renderer when it receives the IPC event.

export type AgentStatusPayload = {
  state: AgentStatusState
  prompt?: string
  agentType?: AgentType
  model?: string
  toolName?: string
  toolInput?: string
  /** JSON string of the AskUserQuestion tool input, captured live. See the
   *  AgentStatusEntry field for semantics. Not truncated like toolInput. */
  interactivePrompt?: string
  lastAssistantMessage?: string
  interrupted?: boolean
  /** Live in-process children of the reporting session. See AgentStatusEntry. */
  subagents?: AgentSubagentSnapshot[]
}

/**
 * The result of `parseAgentStatusPayload`: prompt is always normalized to a
 * string (empty string when the raw payload omits it), so consumers do not
 * need nullish-coalescing on the field. Tool/assistant fields stay optional so
 * absence ("no new info") is distinguishable from an explicit empty string.
 */
export type ParsedAgentStatusPayload = Omit<AgentStatusPayload, 'prompt'> & { prompt: string }

/**
 * Wire shape for agent-status IPC. Both the push channel `agentStatus:set` and the
 * pull procedure `agentStatus.getSnapshot` produces this shape so renderer call sites
 * can apply entries through a single `setAgentStatus` path. Flattens the parsed
 * payload onto pane identity + timing because the renderer's slice expects them
 * destructured.
 */
export type AgentStatusIpcPayload = ParsedAgentStatusPayload & {
  paneKey: string
  launchToken?: string
  terminalHandle?: string
  tabId?: string
  worktreeId?: string
  /** Identifies the SSH connection the event arrived on, or null for local.
   *  Stamped only on the remote-ingest path (AgentStart's `ingestRemote`); the
   *  HTTP path always sets null because it cannot know which mux a request
   *  came from. See docs/design/agent-status-over-ssh.md §5. */
  connectionId: string | null
  /** Timestamp (ms) when the hook server received this latest status event. */
  receivedAt: number
  /** Timestamp (ms) when the current state first appeared for this pane. */
  stateStartedAt: number
  orchestration?: AgentStatusOrchestrationContext
  providerSession?: AgentProviderSessionMetadata
  /** Resume identity update only; status-shaped fields are transport placeholders. */
  providerSessionOnly?: boolean
  /** Live-only Command Code turn boundary key; not persisted to last-status.json. */
  promptInteractionKey?: string
}

/**
 * Freshness threshold for explicit agent status. Retained past this point so
 * WorktreeCard's sidebar dot can decay "working" back to "active" when the
 * hook stream goes silent. Smart-sort + WorktreeCard still read this; the
 * dashboard + hover only display hook-reported data as-is.
 */
export const AGENT_STATUS_STALE_AFTER_MS = 30 * 60 * 1000

export function isFreshNonDoneAgentStatus(
  entry: Pick<AgentStatusEntry, 'state' | 'updatedAt'> | undefined,
  now = Date.now(),
  staleAfterMs = AGENT_STATUS_STALE_AFTER_MS
): boolean {
  return Boolean(entry && entry.state !== 'done' && now - entry.updatedAt <= staleAfterMs)
}

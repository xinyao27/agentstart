import type { ParsedAgentStatusPayload } from '@yiru/protocol/agent/status-records'

import type { AgentCompletionStatusSnapshot } from './completion-coordinator-types'

export type CompletionSource = 'hook' | 'title' | 'process-exit'
export type CompletionIdentitySource = 'hook' | 'title' | 'process-exit'

export type PollCadenceTier = 'active' | 'idle' | 'hidden' | 'no-evidence'

export type LastCompletionIdentity = {
  source: CompletionIdentitySource
  identity: string
  agentIdentity: string | null
}

// Why: worktree switches can remount a pane while the underlying PTY and hook
// stream stay live, so stale completion replays must outlive one coordinator.
export const lastCompletionIdentityByPaneKey = new Map<string, LastCompletionIdentity>()

export const IDLE_POLL_INTERVAL_MS = 2_000
export const ACTIVE_POLL_INTERVAL_MS = 750
// Why: a hidden pane only keeps the process-exit backstop alive — hook and title
// completion signals are push-driven and fire regardless of poll cadence or
// visibility — so it polls the OS process table far less often to cut idle CPU on
// shared SSH relays. Follow-up to #6288 / PR #6667, which deduped scans within a
// tick; this throttles the number of ticks. Visible panes keep full cadence.
export const HIDDEN_POLL_INTERVAL_MS = 3_000
// Why: on hosts where one inspection is a whole-process-table scan (local
// Windows forks a powershell.exe CIM query, ~10-40x heavier than POSIX `ps`),
// a visible idle shell with no agent evidence must not pay that every 2s
// forever. It relaxes to this cadence; output/title/hook activity re-arms the
// hot cadence (see NO_EVIDENCE_ACTIVITY_HOT_WINDOW_MS), so agent starts are
// detected event-driven rather than by burning idle scans.
export const NO_EVIDENCE_POLL_INTERVAL_MS = 15_000
// Why: pane activity (PTY output, title change, hook) means an agent may be
// starting; poll at the full idle cadence this long after the last activity so
// agent-start detection stays prompt without keeping idle panes hot.
export const NO_EVIDENCE_ACTIVITY_HOT_WINDOW_MS = 10_000
export const INSPECTION_TIMEOUT_MS = 15_000
export const PENDING_TITLE_TTL_MS = Math.max(2_000, INSPECTION_TIMEOUT_MS + 500)
export const PENDING_TITLE_MAX_TTL_MS = Math.max(30_000, PENDING_TITLE_TTL_MS)
export const COMPLETION_REPLAY_GUARD_MS = 1_000
export const HOOK_DONE_QUIET_MS = 1_500
// Why: Codex fires its PermissionRequest hook at the human-input boundary before
// the approval decision, so under "Approve for me" the review agent approves and
// Codex resumes almost immediately. Debounce the OS attention notification behind
// this quiet window so a self-resolving pause never raises a false "approval
// required" banner (issue #8387). The visual status still updates immediately.
export const CODEX_ATTENTION_QUIET_MS = 1_500

export const POLL_TIER_INTERVAL_MS: Record<PollCadenceTier, number> = {
  active: ACTIVE_POLL_INTERVAL_MS,
  idle: IDLE_POLL_INTERVAL_MS,
  hidden: HIDDEN_POLL_INTERVAL_MS,
  'no-evidence': NO_EVIDENCE_POLL_INTERVAL_MS
}

export function isCompletionHookState(state: ParsedAgentStatusPayload['state']): boolean {
  // Why: only a genuine 'done' ends a turn. 'waiting'/'blocked' are handled by
  // isAttentionHookState below.
  return state === 'done'
}

export function isAttentionHookState(state: ParsedAgentStatusPayload['state']): boolean {
  // Why: 'waiting' (e.g. a Claude PermissionRequest) and 'blocked' (e.g. a
  // Copilot elicitation dialog) pause mid-turn — the agent is still alive and
  // has not completed, so they must not fire agent-task-complete. The "needs
  // you" notification for these states is raised separately (smart-attention).
  return state === 'waiting' || state === 'blocked'
}

export function hookCompletionIdentity(payload: AgentCompletionStatusSnapshot): string | null {
  if (typeof payload.stateStartedAt !== 'number' || !Number.isFinite(payload.stateStartedAt)) {
    return null
  }
  return [payload.state, payload.agentType ?? '', String(Math.trunc(payload.stateStartedAt))].join(
    ':'
  )
}

export function hookCompletionAgentIdentity(payload: AgentCompletionStatusSnapshot): string | null {
  return payload.agentType?.trim().toLowerCase() || null
}

export function titleCompletionIdentity(title: string): string {
  return title
}

export function titleCompletionAgentIdentity(title: string): string | null {
  const normalized = title.toLowerCase()
  if (/\bcodex\b/.test(normalized)) {
    return 'codex'
  }
  if (/\bclaude\b/.test(normalized)) {
    return 'claude'
  }
  if (/\bgemini\b/.test(normalized)) {
    return 'gemini'
  }
  if (/\bcursor(?: agent)?\b/.test(normalized)) {
    return 'cursor'
  }
  if (/\bopencode\b/.test(normalized)) {
    return 'opencode'
  }
  if (/\bdroid\b/.test(normalized)) {
    return 'droid'
  }
  if (/\bhermes\b/.test(normalized)) {
    return 'hermes'
  }
  if (/\baider\b/.test(normalized)) {
    return 'aider'
  }
  if (/\bpi\b/.test(normalized) || normalized.includes('\u03c0')) {
    return 'pi'
  }
  return null
}

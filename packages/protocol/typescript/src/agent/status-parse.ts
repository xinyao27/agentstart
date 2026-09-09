import {
  normalizeInteractivePromptField,
  normalizeOptionalField,
  normalizeOptionalMultilineField,
  normalizePromptField
} from './status-field-normalization.js'
import type {
  AgentStatusState,
  AgentSubagentSnapshot,
  ParsedAgentStatusPayload
} from './status-records.js'
import { AGENT_STATUS_STATES } from './status-records.js'

export const AGENT_STATUS_TOOL_NAME_MAX_LENGTH = 60
export const AGENT_STATUS_TOOL_INPUT_MAX_LENGTH = 160
export const AGENT_STATUS_ASSISTANT_MESSAGE_MAX_LENGTH = 8000
export const AGENT_STATUS_INTERACTIVE_PROMPT_MAX_LENGTH = 16000
// Why: an open input string must pass membership validation before narrowing.
const VALID_STATES: ReadonlySet<string> = new Set<string>(AGENT_STATUS_STATES)
export const AGENT_TYPE_MAX_LENGTH = 40
export const AGENT_MODEL_MAX_LENGTH = 120

export const AGENT_STATUS_MAX_SUBAGENTS = 32
const AGENT_SUBAGENT_ID_MAX_LENGTH = 64

function normalizeSubagentSnapshot(value: unknown): AgentSubagentSnapshot | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const obj = value as Record<string, unknown>
  if (typeof obj.id !== 'string') {
    return null
  }
  const id = obj.id.trim()
  if (id.length === 0 || id.length > AGENT_SUBAGENT_ID_MAX_LENGTH) {
    return null
  }
  if (
    obj.state !== 'working' &&
    obj.state !== 'blocked' &&
    obj.state !== 'waiting' &&
    obj.state !== 'idle'
  ) {
    return null
  }
  return {
    id,
    state: obj.state,
    startedAt:
      typeof obj.startedAt === 'number' && Number.isFinite(obj.startedAt) ? obj.startedAt : 0,
    agentType: normalizeOptionalField(obj.agentType, AGENT_TYPE_MAX_LENGTH),
    model: normalizeOptionalField(obj.model, AGENT_MODEL_MAX_LENGTH),
    description: normalizeOptionalField(obj.description, AGENT_STATUS_TOOL_INPUT_MAX_LENGTH)
  }
}

function normalizeSubagentsField(value: unknown): AgentSubagentSnapshot[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined
  }
  const normalized: AgentSubagentSnapshot[] = []
  for (const item of value) {
    const snapshot = normalizeSubagentSnapshot(item)
    if (snapshot) {
      normalized.push(snapshot)
      if (normalized.length >= AGENT_STATUS_MAX_SUBAGENTS) {
        break
      }
    }
  }
  return normalized.length > 0 ? normalized : undefined
}

export function agentSubagentsEqual(
  a: AgentSubagentSnapshot[] | undefined,
  b: AgentSubagentSnapshot[] | undefined
): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.length !== b.length) {
    return !a && !b
  }
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.state !== y.state ||
      x.startedAt !== y.startedAt ||
      x.agentType !== y.agentType ||
      x.model !== y.model ||
      x.description !== y.description
    ) {
      return false
    }
  }
  return true
}

function normalizeAgentStatusObject(parsed: unknown): ParsedAgentStatusPayload | null {
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const obj = parsed as Record<string, unknown>
  if (typeof obj.state !== 'string') {
    return null
  }
  const state = obj.state
  if (!VALID_STATES.has(state)) {
    return null
  }
  return {
    state: state as AgentStatusState,
    prompt: normalizePromptField(obj.prompt),
    // Why: single-line labels must not carry embedded control lines into the UI.
    agentType: normalizeOptionalField(obj.agentType, AGENT_TYPE_MAX_LENGTH),
    model: normalizeOptionalField(obj.model, AGENT_MODEL_MAX_LENGTH),
    toolName: normalizeOptionalField(obj.toolName, AGENT_STATUS_TOOL_NAME_MAX_LENGTH),
    toolInput: normalizeOptionalField(obj.toolInput, AGENT_STATUS_TOOL_INPUT_MAX_LENGTH),
    interactivePrompt: normalizeInteractivePromptField(
      obj.interactivePrompt,
      AGENT_STATUS_INTERACTIVE_PROMPT_MAX_LENGTH
    ),
    lastAssistantMessage: normalizeOptionalMultilineField(
      obj.lastAssistantMessage,
      AGENT_STATUS_ASSISTANT_MESSAGE_MAX_LENGTH
    ),
    // Why: only meaningful on `done`. Coerce to undefined on other states so
    // the field doesn't leak stale truth through state transitions.
    interrupted: obj.interrupted === true && state === 'done' ? true : undefined,
    subagents: normalizeSubagentsField(obj.subagents)
  }
}

export function normalizeAgentStatusPayload(payload: unknown): ParsedAgentStatusPayload | null {
  return normalizeAgentStatusObject(payload)
}

export function parseAgentStatusPayload(json: string): ParsedAgentStatusPayload | null {
  try {
    return normalizeAgentStatusObject(JSON.parse(json))
  } catch {
    return null
  }
}

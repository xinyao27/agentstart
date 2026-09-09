import { isTuiAgent } from '../../agent/identity'
import { isTuiAgentEnabled } from '../../agent/selection'
import type { TuiAgent } from '../../agent/types'
import type { CustomAgentId } from '../custom-agent'
import { CLAUDE_CODEX_COMMIT_MESSAGE_CAPABILITIES } from './claude-codex'
import { COPILOT_COMMIT_MESSAGE_CAPABILITIES } from './copilot'
import { labelFromModelId, withOpenAiThinking } from './model-metadata'
import { OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES } from './other-providers'
import type { CommitMessageAgentCapability, CommitMessageModel } from './types'

const COMMIT_MESSAGE_AGENT_CAPABILITIES: Partial<Record<TuiAgent, CommitMessageAgentCapability>> = {
  claude: CLAUDE_CODEX_COMMIT_MESSAGE_CAPABILITIES.claude,
  codex: CLAUDE_CODEX_COMMIT_MESSAGE_CAPABILITIES.codex,
  opencode: OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.opencode,
  pi: OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.pi,
  amp: OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.amp,
  cursor: OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.cursor,
  kimi: OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.kimi,
  copilot: COPILOT_COMMIT_MESSAGE_CAPABILITIES.copilot,
  antigravity: OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.antigravity
}

export const DEFAULT_COMMIT_MESSAGE_AGENT_ID: TuiAgent = 'claude'
export type CommitMessageAgentChoice = TuiAgent | CustomAgentId
export type DefaultTuiAgentPreference = TuiAgent | 'blank' | null | undefined

export function resolveCommitMessageAgentChoice(
  configuredAgentId: CommitMessageAgentChoice | null | undefined,
  defaultTuiAgent: DefaultTuiAgentPreference,
  disabledTuiAgents?: Iterable<unknown> | null
): CommitMessageAgentChoice | null {
  if (configuredAgentId) {
    return configuredAgentId
  }
  if (
    defaultTuiAgent &&
    defaultTuiAgent !== 'blank' &&
    isTuiAgentEnabled(defaultTuiAgent, disabledTuiAgents)
  ) {
    return getCommitMessageAgentCapability(defaultTuiAgent) ? defaultTuiAgent : null
  }
  return isTuiAgentEnabled(DEFAULT_COMMIT_MESSAGE_AGENT_ID, disabledTuiAgents)
    ? DEFAULT_COMMIT_MESSAGE_AGENT_ID
    : null
}

export function getCommitMessageModel(
  agentId: TuiAgent,
  modelId: string
): CommitMessageModel | undefined {
  const spec = getCommitMessageAgentCapability(agentId)
  const model = spec?.models.find((candidate) => candidate.id === modelId)
  if (model || !spec || spec.modelSource !== 'dynamic' || modelId.trim().length === 0) {
    return model
  }
  return { id: modelId, label: labelFromModelId(modelId), ...withOpenAiThinking(modelId) }
}

export function getCommitMessageAgentCapability(
  agentId: TuiAgent
): CommitMessageAgentCapability | undefined {
  const spec = COMMIT_MESSAGE_AGENT_CAPABILITIES[agentId]
  return spec ? toCommitMessageAgentCapability(spec) : undefined
}

export function listCommitMessageAgentIds(): TuiAgent[] {
  return Object.keys(COMMIT_MESSAGE_AGENT_CAPABILITIES).filter(isTuiAgent)
}

export function listCommitMessageAgentCapabilities(): CommitMessageAgentCapability[] {
  return listCommitMessageAgentIds()
    .map((id) => getCommitMessageAgentCapability(id))
    .filter((capability): capability is CommitMessageAgentCapability => Boolean(capability))
}

function toCommitMessageAgentCapability(
  spec: CommitMessageAgentCapability
): CommitMessageAgentCapability {
  return {
    id: spec.id,
    label: spec.label,
    modelSource: spec.modelSource,
    defaultModelId: spec.defaultModelId,
    // Why: renderer settings consume capabilities, never binary/argv contracts.
    models: spec.models.map((model) => ({
      id: model.id,
      label: model.label,
      ...(model.thinkingLevels ? { thinkingLevels: [...model.thinkingLevels] } : {}),
      ...(model.defaultThinkingLevel ? { defaultThinkingLevel: model.defaultThinkingLevel } : {})
    }))
  }
}

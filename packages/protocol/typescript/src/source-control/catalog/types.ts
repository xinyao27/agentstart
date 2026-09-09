import type { TuiAgent } from '../../agent/types'

export type ThinkingLevel = { id: string; label: string }

export type CommitMessageModel = {
  id: string
  label: string
  thinkingLevels?: ThinkingLevel[]
  defaultThinkingLevel?: string
}

export type CommitMessageModelCapability = {
  id: string
  label: string
  thinkingLevels?: ThinkingLevel[]
  defaultThinkingLevel?: string
}

export type CommitMessageAgentCapability = {
  id: TuiAgent
  label: string
  modelSource: 'static' | 'dynamic'
  models: CommitMessageModelCapability[]
  defaultModelId: string
}

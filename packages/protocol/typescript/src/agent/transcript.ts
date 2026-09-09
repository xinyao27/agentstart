import type { AgentType } from './status-records.js'

export type AgentTranscriptSource = 'transcript' | 'hook' | 'scrape'
export type AgentTranscriptRole = 'user' | 'assistant' | 'tool' | 'reasoning' | 'system'

export type AgentTranscriptTextBlock = {
  type: 'text'
  text: string
}

export type AgentTranscriptToolCallBlock = {
  type: 'tool-call'
  name: string
  input: unknown
  callId?: string
}

export type AgentTranscriptToolResultBlock = {
  type: 'tool-result'
  output: string
  isError?: boolean
  callId?: string
  outputSegments?: string[]
}

export type AgentTranscriptImageRefBlock = {
  type: 'image-ref'
  path?: string
  url?: string
  alt?: string
}

export type AgentTranscriptBlock =
  | AgentTranscriptTextBlock
  | AgentTranscriptToolCallBlock
  | AgentTranscriptToolResultBlock
  | AgentTranscriptImageRefBlock

export type AgentTranscriptMessage = {
  id: string
  role: AgentTranscriptRole
  blocks: AgentTranscriptBlock[]
  timestamp: number | null
  source: AgentTranscriptSource
  turnId?: string
}

export type TranscriptAgent = 'claude' | 'codex' | 'grok'

export function resolveTranscriptAgent(
  agent: AgentType | string | null | undefined
): TranscriptAgent | null {
  if (agent === 'claude' || agent === 'openclaude') {
    return 'claude'
  }
  if (agent === 'codex') {
    return 'codex'
  }
  if (agent === 'grok') {
    return 'grok'
  }
  return null
}

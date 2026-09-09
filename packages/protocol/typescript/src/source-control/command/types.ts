import type { TuiAgent } from '../../agent/types'
import type { CommitMessageModel } from '../catalog/types'

export type CommitMessageAgentSpec = {
  id: TuiAgent
  label: string
  binary: string
  promptDelivery: 'argv' | 'stdin'
  buildArgs: (params: { prompt: string; model: string; thinkingLevel?: string }) => string[]
  modelSource: 'static' | 'dynamic'
  models: CommitMessageModel[]
  defaultModelId: string
}

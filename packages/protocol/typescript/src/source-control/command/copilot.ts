import type { TuiAgent } from '../../agent/types'
import { COPILOT_COMMIT_MESSAGE_CAPABILITIES } from '../catalog/copilot'
import type { CommitMessageAgentSpec } from './types'
export const COPILOT_COMMIT_MESSAGE_SPECS: Partial<Record<TuiAgent, CommitMessageAgentSpec>> = {
  copilot: {
    ...COPILOT_COMMIT_MESSAGE_CAPABILITIES.copilot,
    binary: 'copilot',
    promptDelivery: 'argv',
    buildArgs: ({ prompt, model, thinkingLevel }) => [
      '--prompt',
      prompt,
      '--silent',
      '--stream',
      'off',
      '--no-custom-instructions',
      '--model',
      model,
      ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
    ]
  }
}

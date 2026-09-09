import type { TuiAgent } from '../../agent/types'
import { OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES } from '../catalog/other-providers'
import type { CommitMessageAgentSpec } from './types'
export const OTHER_COMMIT_MESSAGE_AGENT_SPECS: Partial<Record<TuiAgent, CommitMessageAgentSpec>> = {
  opencode: {
    ...OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.opencode,
    binary: 'opencode',
    promptDelivery: 'stdin',
    buildArgs: ({ model, thinkingLevel }) => [
      'run',
      '--model',
      model,
      '--agent',
      'build',
      '--format',
      'default',
      ...(thinkingLevel ? ['--variant', thinkingLevel] : [])
    ]
  },
  pi: {
    ...OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.pi,
    binary: 'pi',
    promptDelivery: 'stdin',
    buildArgs: ({ model, thinkingLevel }) => [
      '--print',
      '--no-session',
      '--no-tools',
      '--no-extensions',
      '--no-skills',
      '--no-context-files',
      '--mode',
      'text',
      ...(model ? ['--model', model] : []),
      ...(thinkingLevel ? ['--thinking', thinkingLevel] : [])
    ]
  },
  amp: {
    ...OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.amp,
    binary: 'amp',
    promptDelivery: 'stdin',
    buildArgs: ({ model, thinkingLevel }) => [
      '--execute',
      '--no-notifications',
      '--no-ide',
      '--no-jetbrains',
      '--mode',
      model,
      ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
    ]
  },
  cursor: {
    ...OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.cursor,
    binary: 'cursor-agent',
    promptDelivery: 'argv',
    buildArgs: ({ prompt, model }) => [
      '--print',
      '--mode',
      'ask',
      '--trust',
      '--output-format',
      'text',
      '--model',
      model,
      prompt
    ]
  },
  kimi: {
    ...OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.kimi,
    binary: 'kimi',
    promptDelivery: 'stdin',
    buildArgs: ({ model, thinkingLevel }) => [
      '--print',
      '--quiet',
      ...(model && model !== 'default' ? ['--model', model] : []),
      ...(thinkingLevel === 'on'
        ? ['--thinking']
        : thinkingLevel === 'off'
          ? ['--no-thinking']
          : [])
    ]
  },
  antigravity: {
    ...OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES.antigravity,
    binary: 'agy',
    promptDelivery: 'stdin',
    buildArgs: ({ model }) => ['--print', '--sandbox', '--model', model]
  }
}

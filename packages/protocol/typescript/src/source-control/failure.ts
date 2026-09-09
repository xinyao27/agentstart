import type { SourceControlAiOperation } from './ai-types'

export type GenerationFailureReason =
  | { code: 'unclosed-quote' }
  | {
      code: 'custom-command-empty'
      location: 'plain' | 'commit-settings' | 'source-control-settings'
    }
  | { code: 'binary-required'; kind: 'custom' | 'override' }
  | { code: 'invalid-override' }
  | { code: 'invalid-cli-arguments' }
  | { code: 'unsupported-agent'; agent: string }
  | { code: 'unavailable-model'; model: string; agent: string }
  | { code: 'unsupported-thinking'; model: string }
  | { code: 'invalid-thinking'; level: string; model: string }
  | { code: 'empty-action-template'; operation: SourceControlAiOperation }
  | { code: 'source-agent-required'; settings: boolean; agents: string }
  | {
      code: 'source-agent-unsupported'
      agent: string
      operation: SourceControlAiOperation
      agents: string
    }
  | { code: 'missing-model'; agent: string }

export type GenerationFailure = { ok: false; error: string; reason: GenerationFailureReason }

const OPERATION_LABEL: Record<SourceControlAiOperation, string> = {
  commitMessage: 'commit messages',
  pullRequest: 'pull request details',
  branchName: 'branch names'
}

export function generationFailure(reason: GenerationFailureReason): GenerationFailure {
  return { ok: false, error: failureMessage(reason), reason }
}

function failureMessage(reason: GenerationFailureReason): string {
  switch (reason.code) {
    case 'unclosed-quote':
      return 'Unclosed quote in command template.'
    case 'custom-command-empty':
      switch (reason.location) {
        case 'plain':
          return 'Custom command is empty.'
        case 'commit-settings':
          return 'Custom command is empty. Add one in Settings → Git → AI Commit Messages.'
        case 'source-control-settings':
          return 'Custom command is empty. Add one in Settings -> Git -> Source Control AI.'
      }
    case 'binary-required':
      return reason.kind === 'custom'
        ? 'Custom command must start with a binary name.'
        : 'Agent command override must start with a binary name.'
    case 'invalid-override':
      return 'Agent command override is invalid: Unclosed quote in command template.'
    case 'invalid-cli-arguments':
      return 'CLI arguments are invalid: Unclosed quote in command template.'
    case 'unsupported-agent':
      return `Agent "${reason.agent}" does not support AI commit messages.`
    case 'unavailable-model':
      return `Model "${reason.model}" is not available for ${reason.agent}.`
    case 'unsupported-thinking':
      return `Model "${reason.model}" does not support a thinking effort level.`
    case 'invalid-thinking':
      return `Thinking level "${reason.level}" is not valid for ${reason.model}.`
    case 'empty-action-template':
      return `Command template is empty for ${OPERATION_LABEL[reason.operation]}.`
    case 'source-agent-required':
      return `Choose a supported Source Control AI agent for this action${reason.settings ? ' in Settings -> Git -> Source Control AI' : ''}. Supported agents: ${reason.agents}, or Custom command.`
    case 'source-agent-unsupported':
      return `Agent "${reason.agent}" does not support Source Control AI ${OPERATION_LABEL[reason.operation]}. Supported agents: ${reason.agents}, or Custom command.`
    case 'missing-model':
      return `No model is available for ${reason.agent}.`
  }
}

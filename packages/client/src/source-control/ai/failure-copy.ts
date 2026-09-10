import type { SourceControlAiOperation } from '@agentstart/protocol/source-control/ai-types'
import type { GenerationFailureReason } from '@agentstart/protocol/source-control/failure'
import { translate } from '~renderer/i18n/i18n'

function operationLabel(operation: SourceControlAiOperation): string {
  switch (operation) {
    case 'commitMessage':
      return translate('sourceControl.aiFailure.commitMessages', 'commit messages')
    case 'pullRequest':
      return translate('sourceControl.aiFailure.pullRequestDetails', 'pull request details')
    case 'branchName':
      return translate('sourceControl.aiFailure.branchNames', 'branch names')
  }
}

export function localizeGenerationFailure(reason: GenerationFailureReason): string {
  switch (reason.code) {
    case 'unclosed-quote':
      return translate(
        'sourceControl.aiFailure.unclosedQuote',
        'Unclosed quote in command template.'
      )
    case 'custom-command-empty':
      switch (reason.location) {
        case 'plain':
          return translate('sourceControl.aiFailure.customEmpty', 'Custom command is empty.')
        case 'commit-settings':
          return translate(
            'sourceControl.aiFailure.commitCustomEmpty',
            'Custom command is empty. Add one in Settings → Git → AI Commit Messages.'
          )
        case 'source-control-settings':
          return translate(
            'sourceControl.aiFailure.sourceCustomEmpty',
            'Custom command is empty. Add one in Settings -> Git -> Source Control AI.'
          )
      }
    case 'binary-required':
      return reason.kind === 'custom'
        ? translate(
            'sourceControl.aiFailure.customBinaryRequired',
            'Custom command must start with a binary name.'
          )
        : translate(
            'sourceControl.aiFailure.overrideBinaryRequired',
            'Agent command override must start with a binary name.'
          )
    case 'invalid-override':
      return translate(
        'sourceControl.aiFailure.overrideInvalid',
        'Agent command override is invalid: Unclosed quote in command template.'
      )
    case 'invalid-cli-arguments':
      return translate(
        'sourceControl.aiFailure.argumentsInvalid',
        'CLI arguments are invalid: Unclosed quote in command template.'
      )
    case 'unsupported-agent':
      return translate(
        'sourceControl.aiFailure.unsupportedAgent',
        'Agent "{{agent}}" does not support AI commit messages.',
        { agent: reason.agent }
      )
    case 'unavailable-model':
      return translate(
        'sourceControl.aiFailure.unavailableModel',
        'Model "{{model}}" is not available for {{agent}}.',
        { model: reason.model, agent: reason.agent }
      )
    case 'unsupported-thinking':
      return translate(
        'sourceControl.aiFailure.unsupportedThinking',
        'Model "{{model}}" does not support a thinking effort level.',
        { model: reason.model }
      )
    case 'invalid-thinking':
      return translate(
        'sourceControl.aiFailure.invalidThinking',
        'Thinking level "{{level}}" is not valid for {{model}}.',
        { level: reason.level, model: reason.model }
      )
    case 'empty-action-template':
      return translate(
        'sourceControl.aiFailure.emptyTemplate',
        'Command template is empty for {{operation}}.',
        { operation: operationLabel(reason.operation) }
      )
    case 'source-agent-required':
      return reason.settings
        ? translate(
            'sourceControl.aiFailure.configureSourceAgent',
            'Choose a supported Source Control AI agent for this action in Settings -> Git -> Source Control AI. Supported agents: {{agents}}, or Custom command.',
            { agents: reason.agents }
          )
        : translate(
            'sourceControl.aiFailure.chooseSourceAgent',
            'Choose a supported Source Control AI agent for this action. Supported agents: {{agents}}, or Custom command.',
            { agents: reason.agents }
          )
    case 'source-agent-unsupported':
      return translate(
        'sourceControl.aiFailure.unsupportedSourceAgent',
        'Agent "{{agent}}" does not support Source Control AI {{operation}}. Supported agents: {{agents}}, or Custom command.',
        { agent: reason.agent, operation: operationLabel(reason.operation), agents: reason.agents }
      )
    case 'missing-model':
      return translate(
        'sourceControl.aiFailure.missingModel',
        'No model is available for {{agent}}.',
        { agent: reason.agent }
      )
  }
}

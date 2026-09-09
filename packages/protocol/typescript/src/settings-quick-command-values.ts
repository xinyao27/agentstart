import { create } from '@bufbuild/protobuf'

import {
  SettingsAgentPromptSchema,
  SettingsQuickCommandDeleteSchema,
  SettingsQuickCommandMutationSchema,
  SettingsQuickCommandScopeSchema,
  SettingsQuickCommandSchema,
  SettingsQuickCommandUpsertSchema,
  SettingsTerminalCommandSchema,
  type SettingsQuickCommandMutation as ProtocolCommandMutation,
  type SettingsQuickCommand as ProtocolCommand,
  type SettingsQuickCommandScope as ProtocolCommandScope
} from '../generated/yiru/runtime/v1/settings_pb.js'
import type { TerminalQuickCommand, TerminalQuickCommandMutation } from './settings-values.js'

export function quickCommandMutation(
  mutation: TerminalQuickCommandMutation
): ProtocolCommandMutation {
  if (mutation.type === 'delete') {
    return create(SettingsQuickCommandMutationSchema, {
      mutation: {
        case: 'delete',
        value: create(SettingsQuickCommandDeleteSchema, { id: mutation.id })
      }
    })
  }
  return create(SettingsQuickCommandMutationSchema, {
    mutation: {
      case: 'upsert',
      value: create(SettingsQuickCommandUpsertSchema, {
        command: quickCommand(mutation.command)
      })
    }
  })
}

function quickCommand(command: TerminalQuickCommand): ProtocolCommand {
  const scope = commandScope(command.scope)
  const base = { id: command.id, label: command.label, ...(scope ? { scope } : {}) }
  if (command.action === 'agent-prompt') {
    return create(SettingsQuickCommandSchema, {
      ...base,
      kind: {
        case: 'agentPrompt',
        value: create(SettingsAgentPromptSchema, { agent: command.agent, prompt: command.prompt })
      }
    })
  }
  return create(SettingsQuickCommandSchema, {
    ...base,
    kind: {
      case: 'terminalCommand',
      value: create(SettingsTerminalCommandSchema, {
        command: command.command,
        appendEnter: command.appendEnter
      })
    }
  })
}

function commandScope(
  scope: { type: 'global' } | { type: 'repo'; repoId: string } | undefined
): ProtocolCommandScope | undefined {
  if (!scope) {
    return undefined
  }
  return scope.type === 'global'
    ? create(SettingsQuickCommandScopeSchema, { scope: { case: 'global', value: true } })
    : create(SettingsQuickCommandScopeSchema, { scope: { case: 'repoId', value: scope.repoId } })
}

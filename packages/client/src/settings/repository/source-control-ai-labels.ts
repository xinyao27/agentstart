import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { resolveSourceControlActionCommandTemplate } from '@agentstart/protocol/source-control/action-recipes'
import {
  DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES,
  type SourceControlActionId,
  type SourceControlActionRecipe
} from '@agentstart/protocol/source-control/ai-actions'
import type { RepoSourceControlAiOverrides } from '@agentstart/protocol/source-control/ai-types'
import type { SourceControlAiSettings } from '@agentstart/protocol/source-control/ai-types'
import type { CustomAgentId } from '@agentstart/protocol/source-control/custom-agent'
import { isCustomAgentId } from '@agentstart/protocol/source-control/custom-agent'

export const ACTION_MODE_INHERIT = 'inherit'
export const ACTION_MODE_OVERRIDE = 'override'
export const DEFAULT_AGENT_VALUE = '__default_agent__'
export const CUSTOM_COMMAND_MODE_INHERIT = 'inherit'
export const CUSTOM_COMMAND_MODE_REPO = 'repo'

export function readInheritedCommandTemplate(
  source: SourceControlAiSettings,
  actionId: SourceControlActionId
): string {
  return resolveSourceControlActionCommandTemplate(source.actions, actionId)
}

export function readInheritedAgentArgs(
  source: SourceControlAiSettings,
  actionId: SourceControlActionId
): string {
  return source.actions?.[actionId]?.agentArgs?.trim() ?? ''
}

export function actionAgentSelectValue(
  agentId: TuiAgent | CustomAgentId | null | undefined
): string {
  return agentId ?? DEFAULT_AGENT_VALUE
}

export function resolveAgentArgsPlaceholderAgent(
  agentId: TuiAgent | CustomAgentId | null | undefined,
  source: SourceControlAiSettings,
  actionId: SourceControlActionId,
  defaultTuiAgent: TuiAgent | 'blank' | null | undefined
): TuiAgent | null {
  const effectiveAgent = agentId === undefined ? source.actions?.[actionId]?.agentId : agentId
  if (effectiveAgent && !isCustomAgentId(effectiveAgent)) {
    return effectiveAgent
  }
  return defaultTuiAgent && defaultTuiAgent !== 'blank' ? defaultTuiAgent : null
}

export function completeRepoActionRecipe(
  recipe: SourceControlActionRecipe,
  actionId: SourceControlActionId
): NonNullable<
  NonNullable<RepoSourceControlAiOverrides['actionOverrides']>[SourceControlActionId]
> {
  const commandInputTemplate =
    typeof recipe.commandInputTemplate === 'string'
      ? recipe.commandInputTemplate
      : DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES[actionId]
  const agentArgs = typeof recipe.agentArgs === 'string' ? recipe.agentArgs : ''
  return {
    agentId: recipe.agentId ?? null,
    commandInputTemplate,
    ...(agentArgs ? { agentArgs } : {})
  }
}

export function actionScopeLabel(hasOverride: boolean): string {
  return hasOverride ? 'Customized for this repository' : 'Using global settings'
}

export function commandTemplateStateLabel(args: {
  hasOverride: boolean
  inheritedTemplate: string
  actionId: SourceControlActionId
}): string {
  if (args.hasOverride) {
    return 'Repository custom prompt'
  }
  return args.inheritedTemplate === DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES[args.actionId]
    ? 'AgentStart default prompt'
    : 'Global custom prompt'
}

export function agentArgsStateLabel(args: {
  hasOverride: boolean
  inheritedAgentArgs: string
  repoAgentArgs: string
}): string {
  if (args.hasOverride) {
    return args.repoAgentArgs.trim() ? 'Repository custom args' : 'No args'
  }
  return args.inheritedAgentArgs.trim() ? 'Global custom args' : 'No args'
}

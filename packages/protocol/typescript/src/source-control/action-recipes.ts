import { isTuiAgent } from '../agent/identity'
import {
  SOURCE_CONTROL_ACTION_IDS,
  DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES,
  type SourceControlActionId,
  type SourceControlActionRecipe,
  type SourceControlAiActionDefaults
} from './ai-actions'
import { isCustomAgentId } from './custom-agent'

const ACTION_ID_SET = new Set<string>(SOURCE_CONTROL_ACTION_IDS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeRecordKey(key: string): boolean {
  return key !== '' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

function isSourceControlActionId(value: string): value is SourceControlActionId {
  return ACTION_ID_SET.has(value)
}

export function normalizeSourceControlActionRecipe(
  value: unknown
): SourceControlActionRecipe | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const normalized: SourceControlActionRecipe = {}
  const agentId = value.agentId
  if (
    agentId === null ||
    isTuiAgent(agentId) ||
    (typeof agentId === 'string' && isCustomAgentId(agentId))
  ) {
    normalized.agentId = agentId
  }
  if (typeof value.commandInputTemplate === 'string') {
    normalized.commandInputTemplate = value.commandInputTemplate
  }
  if (typeof value.agentArgs === 'string') {
    normalized.agentArgs = value.agentArgs
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function normalizeSourceControlAiActionDefaults(
  value: unknown
): SourceControlAiActionDefaults | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const normalized: SourceControlAiActionDefaults = {}
  for (const [key, item] of Object.entries(value)) {
    if (!isSafeRecordKey(key) || !isSourceControlActionId(key)) {
      continue
    }
    const defaultValue = normalizeSourceControlActionRecipe(item)
    if (defaultValue) {
      normalized[key] = defaultValue
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function readSourceControlActionDefault(
  defaults: SourceControlAiActionDefaults | null | undefined,
  actionId: SourceControlActionId
): SourceControlActionRecipe {
  const value = defaults?.[actionId]
  return {
    ...(value?.agentId !== undefined ? { agentId: value.agentId } : {}),
    ...(typeof value?.commandInputTemplate === 'string'
      ? { commandInputTemplate: value.commandInputTemplate.trim() }
      : {}),
    ...(typeof value?.agentArgs === 'string' ? { agentArgs: value.agentArgs.trim() } : {})
  }
}

export function resolveSourceControlActionCommandTemplate(
  defaults: SourceControlAiActionDefaults | null | undefined,
  actionId: SourceControlActionId
): string {
  const template = readSourceControlActionDefault(defaults, actionId).commandInputTemplate
  return template !== undefined
    ? template
    : DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES[actionId]
}

export function setSourceControlActionDefault(
  defaults: SourceControlAiActionDefaults | null | undefined,
  actionId: SourceControlActionId,
  value: SourceControlActionRecipe
): SourceControlAiActionDefaults {
  return {
    ...defaults,
    [actionId]: {
      ...defaults?.[actionId],
      ...value
    }
  }
}

export function renderSourceControlActionCommandTemplate(
  template: string,
  variables: Record<string, string | null | undefined>
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}|\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g,
    (match, doubleName, singleName) => {
      const name = (doubleName ?? singleName) as string
      // Why: placeholder names may start with letters or underscores.
      // Why: only own keys are real variables; inherited Object.prototype names
      // (e.g. `constructor`) must stay visible instead of rendering their value.
      if (!Object.prototype.hasOwnProperty.call(variables, name)) {
        return match
      }
      const value = variables[name]
      return value === undefined || value === null ? match : value
    }
  )
}

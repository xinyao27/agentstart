import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import type {
  RepoNullableBool,
  RepoNullableString,
  RepoSourceControlActionOverride,
  RepoSourceControlAiOverrides as ProtocolSourceControlAi,
  RepoSourceControlModelChoice,
  RepoSourceControlPrCreationDefaults
} from '../generated/yiru/runtime/v1/repo_pb.js'
import { RuntimeProtocolError } from './error.js'
import type {
  RepoAgentValue,
  RepoSourceControlAction,
  RepoSourceControlAiValue,
  RepoSourceControlModelChoiceValue,
  RepoSourceControlOperation
} from './repo-types.js'

const AGENTS = new Set<RepoAgentValue>([
  'claude',
  'openclaude',
  'codex',
  'autohand',
  'opencode',
  'mimo-code',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'openclaw',
  'copilot',
  'grok',
  'devin',
  'ante',
  'trae'
])
const OPERATIONS = new Set<RepoSourceControlOperation>([
  'commitMessage',
  'pullRequest',
  'branchName'
])
const ACTIONS = new Set<RepoSourceControlAction>([
  ...OPERATIONS,
  'fixCommitFailure',
  'fixPushFailure',
  'fixChecks',
  'resolveConflicts',
  'resolveComments'
])

export function repoSourceControlAi(value: ProtocolSourceControlAi): RepoSourceControlAiValue {
  const modelOverridesByOperation = entries(
    value.modelOverridesByOperation?.values,
    OPERATIONS,
    modelChoice
  )
  const instructionsByOperation = entries(
    value.instructionsByOperation?.values,
    OPERATIONS,
    nullableString
  )
  const actionOverrides = entries(value.actionOverrides?.values, ACTIONS, actionOverride)
  return {
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
    ...(value.customAgentCommand === undefined
      ? {}
      : { customAgentCommand: value.customAgentCommand }),
    ...(modelOverridesByOperation === undefined ? {} : { modelOverridesByOperation }),
    ...(instructionsByOperation === undefined ? {} : { instructionsByOperation }),
    ...(actionOverrides === undefined ? {} : { actionOverrides }),
    ...(value.prCreationDefaults
      ? { prCreationDefaults: prCreationDefaults(value.prCreationDefaults) }
      : {})
  }
}

function modelChoice(value: RepoSourceControlModelChoice): RepoSourceControlModelChoiceValue {
  const selectedModelByAgent = value.selectedModelByAgent
    ? agentModels(value.selectedModelByAgent.values)
    : undefined
  const selectedModelByAgentByHost = value.selectedModelByAgentByHost
    ? Object.fromEntries(
        Object.entries(value.selectedModelByAgentByHost.values).map(([host, models]) => [
          host,
          agentModels(models.values)
        ])
      )
    : undefined
  return {
    ...(selectedModelByAgent === undefined ? {} : { selectedModelByAgent }),
    ...(selectedModelByAgentByHost === undefined ? {} : { selectedModelByAgentByHost }),
    ...(value.selectedThinkingByModel === undefined
      ? {}
      : { selectedThinkingByModel: value.selectedThinkingByModel.values })
  }
}

function agentModels(value: Record<string, string>): Partial<Record<RepoAgentValue, string>> {
  return Object.fromEntries(
    Object.entries(value).map(([agent, model]) => [known(agent, AGENTS, 'repository agent'), model])
  )
}

function actionOverride(value: RepoSourceControlActionOverride) {
  const agentId = value.agentId ? sourceControlAgent(nullableString(value.agentId)) : undefined
  return {
    ...(agentId === undefined ? {} : { agentId }),
    ...(value.commandInputTemplate
      ? { commandInputTemplate: nullableString(value.commandInputTemplate) }
      : {}),
    ...(value.agentArgs ? { agentArgs: nullableString(value.agentArgs) } : {})
  }
}

function prCreationDefaults(value: RepoSourceControlPrCreationDefaults) {
  return {
    ...(value.draft ? { draft: nullableBool(value.draft) } : {}),
    ...(value.useTemplate ? { useTemplate: nullableBool(value.useTemplate) } : {}),
    ...(value.generateDetailsOnOpen
      ? { generateDetailsOnOpen: nullableBool(value.generateDetailsOnOpen) }
      : {}),
    ...(value.openAfterCreate ? { openAfterCreate: nullableBool(value.openAfterCreate) } : {})
  }
}

function entries<K extends string, V, O>(
  value: Record<string, V> | undefined,
  allowed: Set<K>,
  map: (entry: V) => O
): Partial<Record<K, O>> | undefined {
  if (value === undefined) {
    return undefined
  }
  const output: Partial<Record<K, O>> = {}
  for (const [key, entry] of Object.entries(value)) {
    output[known(key, allowed, 'repository field')] = map(entry)
  }
  return output
}

function known<K extends string>(value: string, allowed: Set<K>, label: string): K {
  const knownValue = [...allowed].find((candidate) => candidate === value)
  if (!knownValue) {
    throw invalidResponse(`${label} is unknown`)
  }
  return knownValue
}

function sourceControlAgent(value: string | null): RepoAgentValue | 'custom' | null {
  if (value === null || value === 'custom') {
    return value
  }
  return known(value, AGENTS, 'repository source-control agent')
}

function nullableString(value: RepoNullableString): string | null {
  switch (value.value.case) {
    case 'text':
      return value.value.value
    case 'null':
      return null
    case undefined:
      throw invalidResponse('Repository nullable string is missing')
  }
}

function nullableBool(value: RepoNullableBool): boolean | null {
  switch (value.value.case) {
    case 'boolean':
      return value.value.value
    case 'null':
      return null
    case undefined:
      throw invalidResponse('Repository nullable boolean is missing')
  }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

import type { TuiAgent } from '../agent/types'
import { normalizeSourceControlActionRecipe } from './action-recipes'
import {
  SOURCE_CONTROL_ACTION_IDS,
  SOURCE_CONTROL_TEXT_ACTION_IDS,
  type SourceControlActionId
} from './ai-actions'
import type {
  RepoSourceControlAiOverrides,
  SourceControlAiModelChoice,
  SourceControlAiOperation
} from './ai-types'
import {
  commandTemplateFromOperationInstruction,
  isLegacyBranchInstructionTemplate
} from './recipe-migration'

type RepoSourceControlActionOverride = NonNullable<
  NonNullable<RepoSourceControlAiOverrides['actionOverrides']>[SourceControlActionId]
>

const SOURCE_CONTROL_AI_OPERATIONS: readonly SourceControlAiOperation[] =
  SOURCE_CONTROL_TEXT_ACTION_IDS
const PR_CREATION_DEFAULT_KEYS = [
  'draft',
  'useTemplate',
  'generateDetailsOnOpen',
  'openAfterCreate'
] as const

export function copyRecord<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasEntries(value: Record<string, unknown> | null | undefined): boolean {
  return Object.keys(value ?? {}).length > 0
}

function isSafeRecordKey(key: string): boolean {
  return key !== '' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isSafeRecordKey(key) && typeof item === 'string') {
      normalized[key] = item
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeAgentModelRecord(value: unknown): Partial<Record<TuiAgent, string>> | undefined {
  return normalizeStringRecord(value) as Partial<Record<TuiAgent, string>> | undefined
}

function normalizeHostAgentModelRecord(
  value: unknown
): Partial<Record<string, Partial<Record<TuiAgent, string>>>> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: Partial<Record<string, Partial<Record<TuiAgent, string>>>> = {}
  for (const [hostKey, hostModels] of Object.entries(value)) {
    if (!isSafeRecordKey(hostKey)) {
      continue
    }
    const normalizedHostModels = normalizeAgentModelRecord(hostModels)
    if (normalizedHostModels) {
      normalized[hostKey] = normalizedHostModels
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeSourceControlAiModelChoice(
  value: unknown
): SourceControlAiModelChoice | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const choice: SourceControlAiModelChoice = {}
  const selectedModelByAgent = normalizeAgentModelRecord(value.selectedModelByAgent)
  if (selectedModelByAgent) {
    choice.selectedModelByAgent = selectedModelByAgent
  }
  const selectedModelByAgentByHost = normalizeHostAgentModelRecord(value.selectedModelByAgentByHost)
  if (selectedModelByAgentByHost) {
    choice.selectedModelByAgentByHost = selectedModelByAgentByHost
  }
  const selectedThinkingByModel = normalizeStringRecord(value.selectedThinkingByModel)
  if (selectedThinkingByModel) {
    choice.selectedThinkingByModel = selectedThinkingByModel
  }
  return Object.keys(choice).length > 0 ? choice : undefined
}

function normalizeOperationRecord<T>(
  value: unknown,
  normalizeValue: (value: unknown) => T | undefined
): Partial<Record<SourceControlAiOperation, T>> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: Partial<Record<SourceControlAiOperation, T>> = {}
  for (const operation of SOURCE_CONTROL_AI_OPERATIONS) {
    if (!Object.prototype.hasOwnProperty.call(value, operation)) {
      continue
    }
    const normalizedValue = normalizeValue(value[operation])
    if (normalizedValue !== undefined) {
      normalized[operation] = normalizedValue
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeActionRecord<T>(
  value: unknown,
  normalizeValue: (value: unknown) => T | undefined
): Partial<Record<SourceControlActionId, T>> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: Partial<Record<SourceControlActionId, T>> = {}
  for (const actionId of SOURCE_CONTROL_ACTION_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, actionId)) {
      continue
    }
    const normalizedValue = normalizeValue(value[actionId])
    if (normalizedValue !== undefined) {
      normalized[actionId] = normalizedValue
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeRepoInstruction(value: unknown): string | null | undefined {
  return typeof value === 'string' || value === null ? value : undefined
}

function normalizeRepoPrCreationDefaults(
  value: unknown
): RepoSourceControlAiOverrides['prCreationDefaults'] {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: NonNullable<RepoSourceControlAiOverrides['prCreationDefaults']> = {}
  for (const key of PR_CREATION_DEFAULT_KEYS) {
    const item = value[key]
    if (typeof item === 'boolean' || item === null) {
      normalized[key] = item
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function normalizeRepoSourceControlAiOverrides(
  value: unknown
): RepoSourceControlAiOverrides | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: RepoSourceControlAiOverrides = {}
  if (typeof value.enabled === 'boolean') {
    normalized.enabled = value.enabled
  }
  if (typeof value.customAgentCommand === 'string') {
    const customAgentCommand = value.customAgentCommand.trim()
    if (customAgentCommand) {
      normalized.customAgentCommand = customAgentCommand
    }
  }
  const modelOverridesByOperation = normalizeOperationRecord(
    value.modelOverridesByOperation,
    normalizeSourceControlAiModelChoice
  )
  if (modelOverridesByOperation) {
    normalized.modelOverridesByOperation = modelOverridesByOperation
  }
  const instructionsByOperation = normalizeOperationRecord(
    value.instructionsByOperation,
    normalizeRepoInstruction
  )
  if (instructionsByOperation) {
    normalized.instructionsByOperation = instructionsByOperation
  }
  const actionOverrides = normalizeActionRecord<RepoSourceControlActionOverride>(
    value.actionOverrides,
    (item) => {
      if (!isRecord(item)) {
        return undefined
      }
      const normalized: RepoSourceControlActionOverride = {
        ...normalizeSourceControlActionRecipe(item)
      }
      if (item.commandInputTemplate === null) {
        normalized.commandInputTemplate = null
      }
      if (item.agentArgs === null) {
        normalized.agentArgs = null
      }
      return Object.keys(normalized).length > 0 ? normalized : undefined
    }
  )
  const migratedActionOverrides = { ...actionOverrides }
  for (const operation of SOURCE_CONTROL_TEXT_ACTION_IDS) {
    const instruction = instructionsByOperation?.[operation]
    const existingTemplate = migratedActionOverrides[operation]?.commandInputTemplate
    if (
      typeof instruction === 'string' &&
      (existingTemplate === undefined ||
        isLegacyBranchInstructionTemplate(operation, instruction, existingTemplate))
    ) {
      migratedActionOverrides[operation] = {
        ...migratedActionOverrides[operation],
        commandInputTemplate: commandTemplateFromOperationInstruction(operation, instruction)
      }
    }
  }
  if (Object.keys(migratedActionOverrides).length > 0) {
    normalized.actionOverrides = migratedActionOverrides
  }
  const prCreationDefaults = normalizeRepoPrCreationDefaults(value.prCreationDefaults)
  if (prCreationDefaults) {
    normalized.prCreationDefaults = prCreationDefaults
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

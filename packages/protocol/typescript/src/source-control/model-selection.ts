import type { TuiAgent } from '../agent/types'
import {
  readSourceControlActionDefault,
  resolveSourceControlActionCommandTemplate
} from './action-recipes'
import type {
  RepoSourceControlAiOverrides,
  SourceControlAiOperation,
  SourceControlAiPrCreationDefaults,
  SourceControlAiSettings
} from './ai-types'
import type { CustomAgentId } from './custom-agent'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from './discovery-host'
import type { CommitMessageAiModelCapability, CommitMessageAiSettings } from './legacy-settings'
import { commandTemplateFromOperationInstruction } from './recipe-migration'
import {
  DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
  readSourceControlAiModelChoiceForHost
} from './settings'

function readDefaultSelectedModelId(
  settings: Pick<SourceControlAiSettings, 'selectedModelByAgent' | 'selectedModelByAgentByHost'>,
  hostKey: string,
  agentId: TuiAgent
): string | undefined {
  return readSourceControlAiModelChoiceForHost(
    {
      selectedModelByAgent: settings.selectedModelByAgent,
      selectedModelByAgentByHost: settings.selectedModelByAgentByHost
    },
    hostKey,
    agentId
  )
}

export function getDiscoveredModels(
  source: SourceControlAiSettings,
  legacy: CommitMessageAiSettings | null | undefined,
  hostKey: string,
  agentId: TuiAgent
): CommitMessageAiModelCapability[] {
  return (
    source.discoveredModelsByAgentByHost?.[hostKey]?.[agentId] ??
    (hostKey === LOCAL_COMMIT_MESSAGE_HOST_KEY
      ? (source.discoveredModelsByAgent?.[agentId] ??
        legacy?.discoveredModelsByAgentByHost?.[hostKey]?.[agentId] ??
        legacy?.discoveredModelsByAgent?.[agentId] ??
        [])
      : (legacy?.discoveredModelsByAgentByHost?.[hostKey]?.[agentId] ?? []))
  )
}

export function selectConfiguredModelId(args: {
  source: SourceControlAiSettings
  legacy: CommitMessageAiSettings | null | undefined
  repoOverrides: RepoSourceControlAiOverrides | null | undefined
  operation: SourceControlAiOperation
  hostKey: string
  agentId: TuiAgent
}): string | undefined {
  const { source, legacy, repoOverrides, operation, hostKey, agentId } = args
  return (
    readSourceControlAiModelChoiceForHost(
      repoOverrides?.modelOverridesByOperation?.[operation],
      hostKey,
      agentId
    ) ??
    readSourceControlAiModelChoiceForHost(
      source.modelOverridesByOperation?.[operation],
      hostKey,
      agentId
    ) ??
    readDefaultSelectedModelId(source, hostKey, agentId) ??
    legacy?.selectedModelByAgentByHost?.[hostKey]?.[agentId] ??
    (hostKey === LOCAL_COMMIT_MESSAGE_HOST_KEY
      ? legacy?.selectedModelByAgent?.[agentId]
      : undefined)
  )
}

export function resolveThinkingLevel(args: {
  model: CommitMessageAiModelCapability
  source: SourceControlAiSettings
  legacy: CommitMessageAiSettings | null | undefined
  repoOverrides: RepoSourceControlAiOverrides | null | undefined
  operation: SourceControlAiOperation
}): string | undefined {
  const { model, source, legacy, repoOverrides, operation } = args
  if (!model.thinkingLevels?.length) {
    return undefined
  }
  const persisted =
    repoOverrides?.modelOverridesByOperation?.[operation]?.selectedThinkingByModel?.[model.id] ??
    source.modelOverridesByOperation?.[operation]?.selectedThinkingByModel?.[model.id] ??
    source.selectedThinkingByModel[model.id] ??
    legacy?.selectedThinkingByModel?.[model.id]
  return model.thinkingLevels.some((level) => level.id === persisted)
    ? persisted
    : model.defaultThinkingLevel
}

function hasOwnInstruction(
  instructions: Partial<Record<SourceControlAiOperation, string | null>> | null | undefined,
  operation: SourceControlAiOperation
): boolean {
  return Object.prototype.hasOwnProperty.call(instructions ?? {}, operation)
}

function readRepoInstructionOverride(
  instructions: RepoSourceControlAiOverrides['instructionsByOperation'],
  operation: SourceControlAiOperation
): string | undefined {
  if (!hasOwnInstruction(instructions, operation)) {
    return undefined
  }
  const instruction = instructions?.[operation]
  return typeof instruction === 'string' ? instruction : undefined
}

// Why: callers that already normalized settings/repo overrides reuse this to
// avoid re-normalizing the same inputs on every instruction lookup.
export function resolveInstructionsFromNormalized(
  source: SourceControlAiSettings,
  repoOverrides: RepoSourceControlAiOverrides | null | undefined,
  operation: SourceControlAiOperation,
  legacyCustomPrompt: string | undefined
): string {
  const repoInstruction = readRepoInstructionOverride(
    repoOverrides?.instructionsByOperation,
    operation
  )
  if (repoInstruction !== undefined) {
    return repoInstruction.trim()
  }
  const globalInstruction = source.instructionsByOperation[operation]
  if (typeof globalInstruction === 'string') {
    return globalInstruction.trim()
  }
  return operation === 'commitMessage' ? (legacyCustomPrompt ?? '').trim() : ''
}

export function resolvePrCreationDefaults(
  source: SourceControlAiSettings,
  repoOverrides: RepoSourceControlAiOverrides | null | undefined,
  productDefaults: SourceControlAiPrCreationDefaults | undefined
): Required<SourceControlAiPrCreationDefaults> {
  const base = {
    ...DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
    ...productDefaults,
    ...source.prCreationDefaults
  }
  const repoDefaults = repoOverrides?.prCreationDefaults
  if (!repoDefaults) {
    return base
  }
  return {
    draft: repoDefaults.draft ?? base.draft,
    useTemplate: repoDefaults.useTemplate ?? base.useTemplate,
    generateDetailsOnOpen: repoDefaults.generateDetailsOnOpen ?? base.generateDetailsOnOpen,
    openAfterCreate: repoDefaults.openAfterCreate ?? base.openAfterCreate
  }
}

export function resolveActionRecipeForTextOperation(
  source: SourceControlAiSettings,
  repoOverrides: RepoSourceControlAiOverrides | null | undefined,
  operation: SourceControlAiOperation
): { agentId?: TuiAgent | CustomAgentId | null; commandInputTemplate: string; agentArgs?: string } {
  const globalRecipe = readSourceControlActionDefault(source.actions, operation)
  const repoRecipe = repoOverrides?.actionOverrides?.[operation]
  const repoInstruction = readRepoInstructionOverride(
    repoOverrides?.instructionsByOperation,
    operation
  )
  const fallbackTemplate =
    repoInstruction !== undefined
      ? commandTemplateFromOperationInstruction(operation, repoInstruction)
      : resolveSourceControlActionCommandTemplate(source.actions, operation)
  const repoTemplate =
    typeof repoRecipe?.commandInputTemplate === 'string'
      ? repoRecipe.commandInputTemplate.trim()
      : undefined
  const repoAgentArgs =
    typeof repoRecipe?.agentArgs === 'string'
      ? repoRecipe.agentArgs.trim()
      : repoRecipe?.agentArgs === null
        ? ''
        : undefined
  return {
    ...(repoRecipe?.agentId !== undefined
      ? { agentId: repoRecipe.agentId }
      : globalRecipe.agentId !== undefined
        ? { agentId: globalRecipe.agentId }
        : {}),
    ...(repoAgentArgs !== undefined
      ? { agentArgs: repoAgentArgs }
      : globalRecipe.agentArgs !== undefined
        ? { agentArgs: globalRecipe.agentArgs }
        : {}),
    commandInputTemplate:
      repoTemplate !== undefined
        ? repoTemplate
        : globalRecipe.commandInputTemplate !== undefined
          ? globalRecipe.commandInputTemplate
          : fallbackTemplate
  }
}

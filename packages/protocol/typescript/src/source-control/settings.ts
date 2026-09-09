import type { TuiAgent } from '../agent/types'
import {
  normalizeSourceControlAiActionDefaults,
  readSourceControlActionDefault
} from './action-recipes'
import {
  DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES,
  SOURCE_CONTROL_ACTION_IDS,
  SOURCE_CONTROL_TEXT_ACTION_IDS
} from './ai-actions'
import type {
  SourceControlAiModelChoice,
  SourceControlAiPrCreationDefaults,
  SourceControlAiSettings
} from './ai-types'
import { isCustomAgentId } from './custom-agent'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from './discovery-host'
import type { CommitMessageAiSettings } from './legacy-settings'
import {
  actionRecipeFromLegacyCommitMessageAi,
  commandTemplateFromOperationInstruction,
  hasActionAgentRecipe,
  isLegacyBranchInstructionTemplate,
  legacyPromptFromCommandTemplate
} from './recipe-migration'
import { copyRecord } from './repo-overrides'

export const DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS: Required<SourceControlAiPrCreationDefaults> =
  {
    draft: false,
    useTemplate: false,
    generateDetailsOnOpen: false,
    openAfterCreate: false
  }

export function getDefaultSourceControlAiSettings(): SourceControlAiSettings {
  return {
    enabled: true,
    actions: Object.fromEntries(
      SOURCE_CONTROL_ACTION_IDS.map((actionId) => [
        actionId,
        { commandInputTemplate: DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES[actionId] }
      ])
    ) as SourceControlAiSettings['actions'],
    agentId: null,
    selectedModelByAgent: {},
    selectedModelByAgentByHost: {},
    discoveredModelsByAgent: {},
    discoveredModelsByAgentByHost: {},
    selectedThinkingByModel: {},
    customAgentCommand: '',
    instructionsByOperation: {
      commitMessage: '',
      pullRequest: '',
      branchName: ''
    },
    prCreationDefaults: { ...DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS },
    launchActionDefaults: {}
  }
}

export function sourceControlAiSettingsFromLegacy(
  legacy: CommitMessageAiSettings | null | undefined
): SourceControlAiSettings {
  const defaults = getDefaultSourceControlAiSettings()
  if (!legacy) {
    return defaults
  }
  const legacyActionRecipe = actionRecipeFromLegacyCommitMessageAi(legacy)
  return {
    ...defaults,
    enabled: legacy.enabled,
    agentId: legacy.agentId,
    selectedModelByAgent: { ...legacy.selectedModelByAgent },
    selectedModelByAgentByHost: copyRecord(legacy.selectedModelByAgentByHost) ?? {},
    discoveredModelsByAgent: copyRecord(legacy.discoveredModelsByAgent) ?? {},
    discoveredModelsByAgentByHost: copyRecord(legacy.discoveredModelsByAgentByHost) ?? {},
    selectedThinkingByModel: { ...legacy.selectedThinkingByModel },
    customAgentCommand: legacy.customAgentCommand,
    instructionsByOperation: {
      commitMessage: legacy.customPrompt ?? '',
      // Why: the legacy prompt covered commit generation and branch auto-rename;
      // the first split must preserve that guidance for both released paths.
      pullRequest: '',
      branchName: legacy.customPrompt ?? ''
    },
    actions: {
      ...defaults.actions,
      commitMessage: legacyActionRecipe,
      branchName: {
        ...legacyActionRecipe,
        commandInputTemplate: commandTemplateFromOperationInstruction(
          'branchName',
          legacy.customPrompt
        )
      }
    }
  }
}

function mergeSelectedModelByAgentByHost(
  base: Partial<Record<string, Partial<Record<TuiAgent, string>>>> | undefined,
  override: Partial<Record<string, Partial<Record<TuiAgent, string>>>> | undefined
): Partial<Record<string, Partial<Record<TuiAgent, string>>>> {
  const merged = copyRecord(base) ?? {}
  for (const [hostKey, hostModels] of Object.entries(override ?? {})) {
    merged[hostKey] = {
      ...merged[hostKey],
      ...hostModels
    }
  }
  return merged
}

export function normalizeSourceControlAiSettings(
  value: SourceControlAiSettings | null | undefined,
  legacy?: CommitMessageAiSettings | null
): SourceControlAiSettings {
  const base = value ?? sourceControlAiSettingsFromLegacy(legacy)
  const defaults = getDefaultSourceControlAiSettings()
  const normalizedLaunchActionDefaults = normalizeSourceControlAiActionDefaults(
    base.launchActionDefaults
  )
  const normalizedActions = {
    ...normalizedLaunchActionDefaults,
    ...normalizeSourceControlAiActionDefaults(base.actions)
  }
  const migratedTextActions = Object.fromEntries(
    SOURCE_CONTROL_TEXT_ACTION_IDS.map((actionId) => {
      const existing = readSourceControlActionDefault(normalizedActions, actionId)
      const instruction = base.instructionsByOperation?.[actionId]
      const legacyInstruction = actionId === 'commitMessage' ? legacy?.customPrompt : undefined
      const resolvedInstruction = instruction ?? legacyInstruction
      const instructionTemplate =
        instruction || legacyInstruction
          ? commandTemplateFromOperationInstruction(actionId, resolvedInstruction)
          : undefined
      const shouldApplyInstructionTemplate =
        instructionTemplate !== undefined &&
        (existing.commandInputTemplate === undefined ||
          existing.commandInputTemplate ===
            DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES[actionId] ||
          isLegacyBranchInstructionTemplate(
            actionId,
            resolvedInstruction,
            existing.commandInputTemplate
          ))
      return [
        actionId,
        {
          ...defaults.actions?.[actionId],
          ...(base.agentId && !isCustomAgentId(base.agentId) ? { agentId: base.agentId } : {}),
          ...existing,
          ...(shouldApplyInstructionTemplate ? { commandInputTemplate: instructionTemplate } : {})
        }
      ]
    })
  ) as SourceControlAiSettings['actions']
  const actions: SourceControlAiSettings['actions'] = {
    ...defaults.actions,
    ...normalizedActions,
    ...migratedTextActions
  }
  return {
    ...defaults,
    ...base,
    selectedModelByAgent: { ...defaults.selectedModelByAgent, ...base.selectedModelByAgent },
    selectedModelByAgentByHost:
      copyRecord(base.selectedModelByAgentByHost) ?? defaults.selectedModelByAgentByHost,
    discoveredModelsByAgent:
      copyRecord(base.discoveredModelsByAgent) ?? defaults.discoveredModelsByAgent,
    discoveredModelsByAgentByHost:
      copyRecord(base.discoveredModelsByAgentByHost) ?? defaults.discoveredModelsByAgentByHost,
    selectedThinkingByModel: {
      ...defaults.selectedThinkingByModel,
      ...base.selectedThinkingByModel
    },
    instructionsByOperation: {
      ...defaults.instructionsByOperation,
      ...base.instructionsByOperation
    },
    modelOverridesByOperation: copyRecord(base.modelOverridesByOperation),
    prCreationDefaults: {
      ...defaults.prCreationDefaults,
      ...base.prCreationDefaults
    },
    actions,
    launchActionDefaults: normalizedLaunchActionDefaults ?? defaults.launchActionDefaults
  }
}

export function readSourceControlAiModelChoiceForHost(
  choice: SourceControlAiModelChoice | null | undefined,
  hostKey: string,
  agentId: TuiAgent
): string | undefined {
  return (
    choice?.selectedModelByAgentByHost?.[hostKey]?.[agentId] ??
    (hostKey === LOCAL_COMMIT_MESSAGE_HOST_KEY
      ? choice?.selectedModelByAgent?.[agentId]
      : undefined)
  )
}

export function projectSourceControlAiToLegacyCommitMessageAi(
  sourceControlAi: SourceControlAiSettings,
  previousLegacy?: CommitMessageAiSettings | null
): CommitMessageAiSettings {
  const commitMessageChoice = sourceControlAi.modelOverridesByOperation?.commitMessage
  const commitRecipe = readSourceControlActionDefault(sourceControlAi.actions, 'commitMessage')
  return {
    enabled: sourceControlAi.enabled,
    agentId: hasActionAgentRecipe(commitRecipe) ? commitRecipe.agentId : sourceControlAi.agentId,
    selectedModelByAgent: {
      ...sourceControlAi.selectedModelByAgent,
      ...commitMessageChoice?.selectedModelByAgent
    },
    selectedModelByAgentByHost: mergeSelectedModelByAgentByHost(
      sourceControlAi.selectedModelByAgentByHost,
      commitMessageChoice?.selectedModelByAgentByHost
    ),
    discoveredModelsByAgent: copyRecord(sourceControlAi.discoveredModelsByAgent) ?? {},
    discoveredModelsByAgentByHost: copyRecord(sourceControlAi.discoveredModelsByAgentByHost) ?? {},
    selectedThinkingByModel: {
      ...sourceControlAi.selectedThinkingByModel,
      ...commitMessageChoice?.selectedThinkingByModel
    },
    customPrompt: legacyPromptFromCommandTemplate(
      commitRecipe.commandInputTemplate,
      sourceControlAi.instructionsByOperation.commitMessage ?? previousLegacy?.customPrompt
    ),
    customAgentCommand: sourceControlAi.customAgentCommand
  }
}

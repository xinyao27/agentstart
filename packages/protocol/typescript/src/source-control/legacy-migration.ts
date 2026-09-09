import type { TuiAgent } from '../agent/types'
import type { SourceControlAiModelChoice, SourceControlAiSettings } from './ai-types'
import type { CommitMessageAiSettings } from './legacy-settings'
import {
  actionRecipeFromLegacyCommitMessageAi,
  applyLegacyAgentToActionRecipe,
  commandTemplateFromOperationInstruction,
  hasLegacyCommitMessageCoreChanges,
  legacyCommitMessageCoreChanges,
  shouldImportLegacyBranchAgent,
  shouldImportLegacyBranchPrompt
} from './recipe-migration'
import { copyRecord, hasEntries } from './repo-overrides'
import {
  normalizeSourceControlAiSettings,
  projectSourceControlAiToLegacyCommitMessageAi
} from './settings'

function mergeLegacyModelSelectionDelta<T>(
  existing: Record<string, T> | null | undefined,
  legacy: Record<string, T> | null | undefined,
  projected: Record<string, T> | null | undefined
): Record<string, T> | undefined {
  const merged: Record<string, T> = { ...existing }
  let changed = false
  const keys = new Set([...Object.keys(legacy ?? {}), ...Object.keys(projected ?? {})])
  for (const key of keys) {
    const legacyHasKey = Object.prototype.hasOwnProperty.call(legacy ?? {}, key)
    const legacyValue = legacy?.[key]
    if (JSON.stringify(projected?.[key]) === JSON.stringify(legacyValue)) {
      continue
    }
    changed = true
    if (legacyHasKey && legacyValue !== undefined) {
      merged[key] = legacyValue
    } else {
      delete merged[key]
    }
  }
  return changed ? merged : (existing ?? undefined)
}

function mergeLegacyHostModelSelectionDelta(
  existing: Partial<Record<string, Partial<Record<TuiAgent, string>>>> | null | undefined,
  legacy: Partial<Record<string, Partial<Record<TuiAgent, string>>>> | null | undefined,
  projected: Partial<Record<string, Partial<Record<TuiAgent, string>>>> | null | undefined
): Partial<Record<string, Partial<Record<TuiAgent, string>>>> | undefined {
  const merged = copyRecord(existing) ?? {}
  let changed = false
  const hostKeys = new Set([...Object.keys(legacy ?? {}), ...Object.keys(projected ?? {})])
  for (const hostKey of hostKeys) {
    const nextHostModels = mergeLegacyModelSelectionDelta(
      merged[hostKey],
      legacy?.[hostKey],
      projected?.[hostKey]
    )
    if (nextHostModels !== merged[hostKey]) {
      changed = true
    }
    if (nextHostModels && Object.keys(nextHostModels).length > 0) {
      merged[hostKey] = nextHostModels
    } else {
      delete merged[hostKey]
    }
  }
  return changed ? merged : (existing ?? undefined)
}

export function mergeLegacyCommitMessageAiIntoSourceControlAi(
  sourceControlAi: SourceControlAiSettings | null | undefined,
  legacy: CommitMessageAiSettings | null | undefined,
  options: { pullRequestInstructionsFromLegacy?: boolean } = {}
): SourceControlAiSettings {
  // Why: older runtimes and rollback builds still write commitMessageAi; merge
  // those writes into the new shape without wiping PR-only settings.
  const base = normalizeSourceControlAiSettings(sourceControlAi, legacy)
  if (!legacy) {
    return base
  }
  if (sourceControlAi) {
    const existingCommitChoice = base.modelOverridesByOperation?.commitMessage
    const projectedLegacy = projectSourceControlAiToLegacyCommitMessageAi(base)
    const selectedModelByAgent = mergeLegacyModelSelectionDelta(
      existingCommitChoice?.selectedModelByAgent,
      legacy.selectedModelByAgent,
      projectedLegacy.selectedModelByAgent
    )
    const selectedModelByAgentByHost = mergeLegacyHostModelSelectionDelta(
      existingCommitChoice?.selectedModelByAgentByHost,
      legacy.selectedModelByAgentByHost,
      projectedLegacy.selectedModelByAgentByHost
    )
    const selectedThinkingByModel = mergeLegacyModelSelectionDelta(
      existingCommitChoice?.selectedThinkingByModel,
      legacy.selectedThinkingByModel,
      projectedLegacy.selectedThinkingByModel
    )
    const shouldMergeLegacyModels =
      selectedModelByAgent !== existingCommitChoice?.selectedModelByAgent ||
      selectedModelByAgentByHost !== existingCommitChoice?.selectedModelByAgentByHost ||
      selectedThinkingByModel !== existingCommitChoice?.selectedThinkingByModel
    const nextModelOverridesByOperation = { ...base.modelOverridesByOperation }
    if (shouldMergeLegacyModels) {
      const nextCommitChoice: SourceControlAiModelChoice = {}
      if (hasEntries(selectedModelByAgent)) {
        nextCommitChoice.selectedModelByAgent = selectedModelByAgent
      }
      if (hasEntries(selectedModelByAgentByHost)) {
        nextCommitChoice.selectedModelByAgentByHost = selectedModelByAgentByHost
      }
      if (hasEntries(selectedThinkingByModel)) {
        nextCommitChoice.selectedThinkingByModel = selectedThinkingByModel
      }
      if (Object.keys(nextCommitChoice).length > 0) {
        nextModelOverridesByOperation.commitMessage = nextCommitChoice
      } else {
        delete nextModelOverridesByOperation.commitMessage
      }
    }
    // Why: rollback builds write commitMessageAi, while new builds project
    // commit-message overrides there. Keep those model choices scoped to
    // commit-message generation so PR defaults cannot drift on reload.
    const legacyActionRecipe = actionRecipeFromLegacyCommitMessageAi(legacy)
    const legacyChanges = legacyCommitMessageCoreChanges(legacy, projectedLegacy)
    const shouldMergeLegacyCore = hasLegacyCommitMessageCoreChanges(legacyChanges)
    const shouldMergeBranchPrompt =
      legacyChanges.customPrompt && shouldImportLegacyBranchPrompt(base, projectedLegacy)
    const shouldMergeBranchAgent =
      legacyChanges.agentId && shouldImportLegacyBranchAgent(base, projectedLegacy)
    return normalizeSourceControlAiSettings(
      {
        ...base,
        discoveredModelsByAgent: copyRecord(legacy.discoveredModelsByAgent) ?? {},
        discoveredModelsByAgentByHost: copyRecord(legacy.discoveredModelsByAgentByHost) ?? {},
        ...(shouldMergeLegacyCore
          ? {
              // Why: legacy commitMessageAi is also our rollback projection.
              // Only import fields that diverged so independent action recipes survive.
              ...(legacyChanges.enabled ? { enabled: legacy.enabled } : {}),
              ...(legacyChanges.agentId ? { agentId: legacy.agentId } : {}),
              ...(legacyChanges.customAgentCommand
                ? { customAgentCommand: legacy.customAgentCommand }
                : {}),
              instructionsByOperation: {
                ...base.instructionsByOperation,
                ...(legacyChanges.customPrompt ? { commitMessage: legacy.customPrompt ?? '' } : {}),
                ...(shouldMergeBranchPrompt ? { branchName: legacy.customPrompt ?? '' } : {}),
                ...(legacyChanges.customPrompt && options.pullRequestInstructionsFromLegacy
                  ? { pullRequest: legacy.customPrompt ?? '' }
                  : {})
              },
              actions: {
                ...base.actions,
                commitMessage: {
                  ...(legacyChanges.agentId
                    ? applyLegacyAgentToActionRecipe(base.actions?.commitMessage, legacy.agentId)
                    : base.actions?.commitMessage),
                  ...(legacyChanges.customPrompt
                    ? { commandInputTemplate: legacyActionRecipe.commandInputTemplate }
                    : {})
                },
                branchName: {
                  ...(shouldMergeBranchAgent
                    ? applyLegacyAgentToActionRecipe(base.actions?.branchName, legacy.agentId)
                    : base.actions?.branchName),
                  ...(shouldMergeBranchPrompt
                    ? {
                        commandInputTemplate: commandTemplateFromOperationInstruction(
                          'branchName',
                          legacy.customPrompt
                        )
                      }
                    : {})
                }
              }
            }
          : {}),
        modelOverridesByOperation: nextModelOverridesByOperation
      },
      shouldMergeLegacyCore ? legacy : undefined
    )
  }
  return normalizeSourceControlAiSettings(
    {
      ...base,
      enabled: legacy.enabled,
      agentId: legacy.agentId,
      selectedModelByAgent: { ...legacy.selectedModelByAgent },
      selectedModelByAgentByHost: copyRecord(legacy.selectedModelByAgentByHost) ?? {},
      discoveredModelsByAgent: copyRecord(legacy.discoveredModelsByAgent) ?? {},
      discoveredModelsByAgentByHost: copyRecord(legacy.discoveredModelsByAgentByHost) ?? {},
      selectedThinkingByModel: { ...legacy.selectedThinkingByModel },
      customAgentCommand: legacy.customAgentCommand,
      instructionsByOperation: {
        ...base.instructionsByOperation,
        commitMessage: legacy.customPrompt ?? '',
        branchName: legacy.customPrompt ?? '',
        ...(options.pullRequestInstructionsFromLegacy
          ? { pullRequest: legacy.customPrompt ?? '' }
          : {})
      }
    },
    legacy
  )
}

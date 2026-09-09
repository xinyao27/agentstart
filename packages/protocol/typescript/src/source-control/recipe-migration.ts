import type { TuiAgent } from '../agent/types'
import { readSourceControlActionDefault } from './action-recipes'
import {
  DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES,
  type SourceControlActionRecipe
} from './ai-actions'
import type { SourceControlAiOperation, SourceControlAiSettings } from './ai-types'
import { CUSTOM_AGENT_ID, type CustomAgentId, isCustomAgentId } from './custom-agent'
import type { CommitMessageAiSettings } from './legacy-settings'

export function commandTemplateFromInstruction(instruction: string | null | undefined): string {
  const trimmed = instruction?.trim()
  if (!trimmed) {
    return '{basePrompt}'
  }
  return ['{basePrompt}', '', trimmed].join('\n')
}

export function commandTemplateFromOperationInstruction(
  operation: SourceControlAiOperation,
  instruction: string | null | undefined
): string {
  const trimmed = instruction?.trim()
  if (!trimmed) {
    return '{basePrompt}'
  }
  // Why: branch naming instructions define naming style, so they must precede
  // the general built-in prompt. Other operations retain their released order.
  return operation === 'branchName'
    ? [trimmed, '', '{basePrompt}'].join('\n')
    : commandTemplateFromInstruction(trimmed)
}

export function isLegacyBranchInstructionTemplate(
  operation: SourceControlAiOperation,
  instruction: string | null | undefined,
  template: string | null | undefined
): boolean {
  // Why: reorder only the exact template older settings derived automatically;
  // a user-authored command template remains authoritative.
  return (
    operation === 'branchName' &&
    Boolean(instruction?.trim()) &&
    template === commandTemplateFromInstruction(instruction)
  )
}

export function actionRecipeFromLegacyCommitMessageAi(legacy: CommitMessageAiSettings): {
  agentId?: TuiAgent | CustomAgentId | null
  commandInputTemplate: string
} {
  return {
    ...(legacy.agentId === null
      ? { agentId: null }
      : isCustomAgentId(legacy.agentId)
        ? { agentId: CUSTOM_AGENT_ID }
        : legacy.agentId
          ? { agentId: legacy.agentId }
          : {}),
    commandInputTemplate: commandTemplateFromInstruction(legacy.customPrompt)
  }
}

export function legacyPromptFromCommandTemplate(
  template: string | undefined,
  fallback: string | undefined
): string {
  const trimmed = template?.trim()
  if (!trimmed || trimmed === '{basePrompt}') {
    return fallback ?? ''
  }
  if (trimmed.startsWith('{basePrompt}')) {
    return trimmed.slice('{basePrompt}'.length).trim()
  }
  return trimmed
}

export function hasActionAgentRecipe(recipe: {
  agentId?: TuiAgent | CustomAgentId | null
}): recipe is { agentId: TuiAgent | CustomAgentId | null } {
  return Object.prototype.hasOwnProperty.call(recipe, 'agentId')
}

export function legacyCommitMessageCoreChanges(
  legacy: CommitMessageAiSettings,
  projected: CommitMessageAiSettings
): Record<'enabled' | 'agentId' | 'customPrompt' | 'customAgentCommand', boolean> {
  return {
    enabled: legacy.enabled !== projected.enabled,
    agentId: legacy.agentId !== projected.agentId,
    customPrompt: legacy.customPrompt !== projected.customPrompt,
    customAgentCommand: legacy.customAgentCommand !== projected.customAgentCommand
  }
}

export function hasLegacyCommitMessageCoreChanges(
  changes: Record<'enabled' | 'agentId' | 'customPrompt' | 'customAgentCommand', boolean>
): boolean {
  return Object.values(changes).some(Boolean)
}

export function applyLegacyAgentToActionRecipe(
  recipe: SourceControlActionRecipe | undefined,
  agentId: CommitMessageAiSettings['agentId']
): SourceControlActionRecipe {
  const next = { ...recipe }
  if (agentId === null) {
    next.agentId = null
  } else if (isCustomAgentId(agentId)) {
    next.agentId = CUSTOM_AGENT_ID
  } else if (agentId && !isCustomAgentId(agentId)) {
    next.agentId = agentId
  } else {
    delete next.agentId
  }
  return next
}

export function shouldImportLegacyBranchPrompt(
  base: SourceControlAiSettings,
  projectedLegacy: CommitMessageAiSettings
): boolean {
  const branchRecipe = readSourceControlActionDefault(base.actions, 'branchName')
  const projectedTemplate = commandTemplateFromOperationInstruction(
    'branchName',
    projectedLegacy.customPrompt
  )
  return (
    branchRecipe.commandInputTemplate === undefined ||
    branchRecipe.commandInputTemplate ===
      DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES.branchName ||
    // Why: stale legacy branch instructions can remain after a user customizes
    // the new branch action recipe; only recipe state can prove it is still coupled.
    branchRecipe.commandInputTemplate === projectedTemplate
  )
}

export function shouldImportLegacyBranchAgent(
  base: SourceControlAiSettings,
  projectedLegacy: CommitMessageAiSettings
): boolean {
  const branchRecipe = readSourceControlActionDefault(base.actions, 'branchName')
  return !hasActionAgentRecipe(branchRecipe) || branchRecipe.agentId === projectedLegacy.agentId
}

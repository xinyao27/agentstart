import type { TuiAgent } from '../agent/types'
import {
  readSourceControlActionDefault,
  resolveSourceControlActionCommandTemplate
} from './action-recipes'
import type { SourceControlActionId, SourceControlActionRecipe } from './ai-actions'
import type { SourceControlAiOperation, SourceControlAiPrCreationDefaults } from './ai-types'
import type { SourceControlAiSettings, RepoSourceControlAiOverrides } from './ai-types'
import {
  getCommitMessageAgentCapability,
  getCommitMessageModel,
  listCommitMessageAgentCapabilities,
  resolveCommitMessageAgentChoice
} from './catalog/agents'
import { CUSTOM_AGENT_ID, isCustomAgentId } from './custom-agent'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from './discovery-host'
import { generationFailure, type GenerationFailure } from './failure'
import type { CommitMessageAiSettings } from './legacy-settings'
import {
  getDiscoveredModels,
  resolveActionRecipeForTextOperation,
  resolveInstructionsFromNormalized,
  resolvePrCreationDefaults,
  resolveThinkingLevel,
  selectConfiguredModelId
} from './model-selection'
import { hasActionAgentRecipe } from './recipe-migration'
import { normalizeRepoSourceControlAiOverrides } from './repo-overrides'
import { normalizeSourceControlAiSettings } from './settings'

type SourceControlGenerationSettings = {
  defaultTuiAgent?: TuiAgent | 'blank' | null
  agentCmdOverrides?: Partial<Record<TuiAgent, string>>
  commitMessageAi?: CommitMessageAiSettings
  sourceControlAi?: SourceControlAiSettings
  disabledTuiAgents?: TuiAgent[]
}

export type ResolvedSourceControlAiGenerationParams = {
  agentId: TuiAgent | 'custom'
  model: string
  thinkingLevel?: string
  customPrompt?: string
  commandInputTemplate?: string
  agentArgs?: string
  customAgentCommand?: string
  agentCommandOverride?: string
}

export type ResolvedSourceControlAiOperation = {
  enabled: boolean
  params: ResolvedSourceControlAiGenerationParams
  prCreationDefaults: Required<SourceControlAiPrCreationDefaults>
}

export type ResolveSourceControlAiResult =
  | { ok: true; value: ResolvedSourceControlAiOperation }
  | GenerationFailure

export type ResolveSourceControlAiInput = {
  settings: Pick<
    SourceControlGenerationSettings,
    'defaultTuiAgent' | 'agentCmdOverrides' | 'commitMessageAi' | 'sourceControlAi'
  > &
    Partial<Pick<SourceControlGenerationSettings, 'disabledTuiAgents'>>
  repo?: { sourceControlAi?: RepoSourceControlAiOverrides | null } | null
  operation: SourceControlAiOperation
  discoveryHostKey?: string
  prCreationProductDefaults?: SourceControlAiPrCreationDefaults
}

export type ResolveSourceControlAiPrCreationDefaultsInput = {
  settings: Pick<SourceControlGenerationSettings, 'commitMessageAi' | 'sourceControlAi'>
  repo?: { sourceControlAi?: RepoSourceControlAiOverrides | null } | null
  prCreationProductDefaults?: SourceControlAiPrCreationDefaults
}

function supportedSourceControlAiAgentSummary(): string {
  return listCommitMessageAgentCapabilities()
    .map((capability) => capability.label)
    .join(', ')
}

export function resolveSourceControlAiPrCreationDefaults(
  input: ResolveSourceControlAiPrCreationDefaultsInput
): Required<SourceControlAiPrCreationDefaults> {
  const source = normalizeSourceControlAiSettings(
    input.settings.sourceControlAi,
    input.settings.commitMessageAi
  )
  return resolvePrCreationDefaults(
    source,
    normalizeRepoSourceControlAiOverrides(input.repo?.sourceControlAi),
    input.prCreationProductDefaults
  )
}

export function resolveSourceControlAiEnabled(input: {
  settings:
    | Pick<SourceControlGenerationSettings, 'sourceControlAi' | 'commitMessageAi'>
    | null
    | undefined
  repo?: { sourceControlAi?: RepoSourceControlAiOverrides | null } | null
}): boolean {
  const source = normalizeSourceControlAiSettings(
    input.settings?.sourceControlAi,
    input.settings?.commitMessageAi
  )
  const repoOverrides = normalizeRepoSourceControlAiOverrides(input.repo?.sourceControlAi)
  return repoOverrides?.enabled ?? source.enabled
}

export function resolveSourceControlActionRecipe(input: {
  settings:
    | Pick<SourceControlGenerationSettings, 'sourceControlAi' | 'commitMessageAi'>
    | null
    | undefined
  repo?: { sourceControlAi?: RepoSourceControlAiOverrides | null } | null
  actionId: SourceControlActionId
}): SourceControlActionRecipe {
  const source = normalizeSourceControlAiSettings(
    input.settings?.sourceControlAi,
    input.settings?.commitMessageAi
  )
  const globalRecipe = readSourceControlActionDefault(source.actions, input.actionId)
  const repoRecipe = normalizeRepoSourceControlAiOverrides(input.repo?.sourceControlAi)
    ?.actionOverrides?.[input.actionId]
  if (!repoRecipe) {
    return {
      ...globalRecipe,
      commandInputTemplate: resolveSourceControlActionCommandTemplate(
        source.actions,
        input.actionId
      )
    }
  }
  return {
    ...globalRecipe,
    commandInputTemplate: resolveSourceControlActionCommandTemplate(source.actions, input.actionId),
    ...(repoRecipe.agentId !== undefined ? { agentId: repoRecipe.agentId } : {}),
    ...(typeof repoRecipe.commandInputTemplate === 'string'
      ? { commandInputTemplate: repoRecipe.commandInputTemplate.trim() }
      : {}),
    ...(typeof repoRecipe.agentArgs === 'string'
      ? { agentArgs: repoRecipe.agentArgs.trim() }
      : repoRecipe.agentArgs === null
        ? { agentArgs: '' }
        : {})
  }
}

export function resolveSourceControlAiForOperation(
  input: ResolveSourceControlAiInput
): ResolveSourceControlAiResult {
  const legacy = input.settings.commitMessageAi
  const source = normalizeSourceControlAiSettings(input.settings.sourceControlAi, legacy)
  const repoOverrides = normalizeRepoSourceControlAiOverrides(input.repo?.sourceControlAi)

  const prCreationDefaults = resolvePrCreationDefaults(
    source,
    repoOverrides,
    input.prCreationProductDefaults
  )
  const actionRecipe = resolveActionRecipeForTextOperation(source, repoOverrides, input.operation)
  if (!actionRecipe.commandInputTemplate.trim()) {
    return generationFailure({ code: 'empty-action-template', operation: input.operation })
  }
  // Why: action recipes own the new customization model. The legacy global
  // agent remains a fallback so existing users migrate without losing intent.
  const preferredAgent = hasActionAgentRecipe(actionRecipe) ? actionRecipe.agentId : source.agentId
  const agentChoice = resolveCommitMessageAgentChoice(
    preferredAgent,
    input.settings.defaultTuiAgent,
    input.settings.disabledTuiAgents
  )
  if (!agentChoice) {
    return generationFailure({
      code: 'source-agent-required',
      settings: true,
      agents: supportedSourceControlAiAgentSummary()
    })
  }

  const customAgentCommand =
    repoOverrides?.customAgentCommand?.trim() || source.customAgentCommand.trim()
  if (isCustomAgentId(agentChoice)) {
    if (!customAgentCommand) {
      return generationFailure({
        code: 'custom-command-empty',
        location: 'source-control-settings'
      })
    }
    return {
      ok: true,
      value: {
        enabled: true,
        params: {
          agentId: CUSTOM_AGENT_ID,
          model: '',
          customPrompt: resolveInstructionsFromNormalized(
            source,
            repoOverrides,
            input.operation,
            legacy?.customPrompt
          ),
          commandInputTemplate: actionRecipe.commandInputTemplate,
          ...(actionRecipe.agentArgs !== undefined ? { agentArgs: actionRecipe.agentArgs } : {}),
          customAgentCommand
        },
        prCreationDefaults
      }
    }
  }

  const agentId = agentChoice
  const actionAgentId = actionRecipe.agentId ?? agentId
  const resolvedActionAgentId =
    actionAgentId === agentId
      ? agentId
      : resolveCommitMessageAgentChoice(
          actionAgentId,
          input.settings.defaultTuiAgent,
          input.settings.disabledTuiAgents
        )
  if (!resolvedActionAgentId || isCustomAgentId(resolvedActionAgentId)) {
    return generationFailure({
      code: 'source-agent-required',
      settings: false,
      agents: supportedSourceControlAiAgentSummary()
    })
  }
  const spec = getCommitMessageAgentCapability(resolvedActionAgentId)
  if (!spec) {
    return generationFailure({
      code: 'source-agent-unsupported',
      agent: resolvedActionAgentId,
      operation: input.operation,
      agents: supportedSourceControlAiAgentSummary()
    })
  }

  const hostKey = input.discoveryHostKey ?? LOCAL_COMMIT_MESSAGE_HOST_KEY
  const configuredModelId = selectConfiguredModelId({
    source,
    legacy,
    repoOverrides,
    operation: input.operation,
    hostKey,
    agentId: resolvedActionAgentId
  })
  const selectedModelId = configuredModelId ?? spec.defaultModelId
  const discoveredModels = getDiscoveredModels(source, legacy, hostKey, resolvedActionAgentId)
  const model =
    spec.models.find((candidate) => candidate.id === selectedModelId) ??
    discoveredModels.find((candidate) => candidate.id === selectedModelId) ??
    getCommitMessageModel(resolvedActionAgentId, spec.defaultModelId)
  if (!model) {
    return generationFailure({ code: 'missing-model', agent: spec.label })
  }

  // Why: Pi spans providers with independent auth. When the user did not pick a
  // model, omitting --model lets Pi use the provider already configured in Pi.
  const usePiConfiguredDefault = resolvedActionAgentId === 'pi' && !configuredModelId
  const thinkingLevel = usePiConfiguredDefault
    ? undefined
    : resolveThinkingLevel({
        model,
        source,
        legacy,
        repoOverrides,
        operation: input.operation
      })
  const agentCommandOverride = input.settings.agentCmdOverrides?.[resolvedActionAgentId]?.trim()
  return {
    ok: true,
    value: {
      enabled: true,
      params: {
        agentId: resolvedActionAgentId,
        model: usePiConfiguredDefault ? '' : model.id,
        thinkingLevel,
        customPrompt: resolveInstructionsFromNormalized(
          source,
          repoOverrides,
          input.operation,
          legacy?.customPrompt
        ),
        commandInputTemplate: actionRecipe.commandInputTemplate,
        ...(actionRecipe.agentArgs !== undefined ? { agentArgs: actionRecipe.agentArgs } : {}),
        ...(customAgentCommand ? { customAgentCommand } : {}),
        ...(agentCommandOverride ? { agentCommandOverride } : {})
      },
      prCreationDefaults
    }
  }
}

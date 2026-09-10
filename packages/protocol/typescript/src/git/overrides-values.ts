import { create } from '@bufbuild/protobuf'

import {
  GitAiActionOverrideSchema,
  GitAiCapabilityListByHostSchema,
  GitAiCapabilityListSchema,
  GitAiCapabilitySchema,
  GitAiCapabilityThinkingLevelSchema,
  GitAiModelOverrideSchema,
  GitAiPrCreationDefaultsSchema,
  GitAiStringMapSchema,
  GitCommitMessageAiSettingsSchema,
  GitGenerationOverridesSchema,
  GitGenerationParamsSchema,
  GitSourceControlAiSettingsSchema,
  type GitCommitMessageAiSettings as ProtocolCommitMessageAiSettings,
  type GitGenerationOverrides as ProtocolGenerationOverrides,
  type GitGenerationParams as ProtocolGenerationParams,
  type GitSourceControlAiSettings as ProtocolSourceControlAiSettings
} from '../../generated/agent_start/runtime/v1/git_generation_pb.js'

type CapabilityInput = {
  id: string
  label: string
  thinkingLevels?: { id: string; label: string }[]
  defaultThinkingLevel?: string
}

function capabilityToProto(value: CapabilityInput) {
  return create(GitAiCapabilitySchema, {
    id: value.id,
    label: value.label,
    thinkingLevels: (value.thinkingLevels ?? []).map((level) =>
      create(GitAiCapabilityThinkingLevelSchema, { id: level.id, label: level.label })
    ),
    defaultThinkingLevel: value.defaultThinkingLevel
  })
}

function capabilityMapToProto(value: Partial<Record<string, CapabilityInput[]>> | undefined) {
  const entries = Object.entries(value ?? {}).map(
    ([agent, capabilities]) =>
      [
        agent,
        create(GitAiCapabilityListSchema, {
          capabilities: (capabilities ?? []).map(capabilityToProto)
        })
      ] as const
  )
  return Object.fromEntries(entries)
}

function nestedCapabilityMapToProto(
  value: Partial<Record<string, Partial<Record<string, CapabilityInput[]>>>> | undefined
) {
  const entries = Object.entries(value ?? {}).map(
    ([agent, byHost]) =>
      [
        agent,
        create(GitAiCapabilityListByHostSchema, { byHost: capabilityMapToProto(byHost) })
      ] as const
  )
  return Object.fromEntries(entries)
}

// Why: entries are filtered instead of spread so an explicit `undefined` in a
// Partial map never reaches the protobuf map field as a value.
function stringMapToProto(
  value: Partial<Record<string, string>> | undefined
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
}

function nestedStringMapToProto(
  value: Partial<Record<string, Partial<Record<string, string>>>> | undefined
) {
  const entries = Object.entries(value ?? {}).map(
    ([host, values]) =>
      [host, create(GitAiStringMapSchema, { values: stringMapToProto(values) })] as const
  )
  return Object.fromEntries(entries)
}

// Why: the maps are `Partial` because callers hold the workbench settings
// model, whose agent-keyed maps are `Partial<Record<TuiAgent, …>>`; protobuf
// map fields treat absent keys and `undefined` values identically.
export type GitCommitMessageAiSettingsInput = {
  enabled: boolean
  agentId: string | null
  selectedModelByAgent: Partial<Record<string, string>>
  selectedModelByAgentByHost?: Partial<Record<string, Partial<Record<string, string>>>>
  discoveredModelsByAgent?: Partial<Record<string, CapabilityInput[]>>
  discoveredModelsByAgentByHost?: Partial<
    Record<string, Partial<Record<string, CapabilityInput[]>>>
  >
  selectedThinkingByModel: Record<string, string>
  customPrompt: string
  customAgentCommand: string
}

export type GitActionOverrideInput = {
  agentId?: string | null
  commandInputTemplate?: string | null
  agentArgs?: string | null
}

export type GitModelOverrideInput = {
  selectedModelByAgent?: Partial<Record<string, string>>
  selectedModelByAgentByHost?: Partial<Record<string, Partial<Record<string, string>>>>
  selectedThinkingByModel?: Record<string, string>
}

export type GitSourceControlAiSettingsInput = Omit<
  GitCommitMessageAiSettingsInput,
  'customPrompt'
> & {
  actions?: Partial<Record<string, GitActionOverrideInput>>
  instructionsByOperation?: Partial<Record<string, string>>
  modelOverridesByOperation?: Partial<Record<string, GitModelOverrideInput>>
  prCreationDefaults?: {
    draft?: boolean
    useTemplate?: boolean
    generateDetailsOnOpen?: boolean
    openAfterCreate?: boolean
  }
  launchActionDefaults?: Partial<Record<string, GitActionOverrideInput>>
}

function commitMessageAiSettingsToProto(
  value: GitCommitMessageAiSettingsInput
): ProtocolCommitMessageAiSettings {
  return create(GitCommitMessageAiSettingsSchema, {
    enabled: value.enabled,
    agentId: value.agentId ?? undefined,
    selectedModelByAgent: stringMapToProto(value.selectedModelByAgent),
    selectedModelByAgentByHost: nestedStringMapToProto(value.selectedModelByAgentByHost),
    discoveredModelsByAgent: capabilityMapToProto(value.discoveredModelsByAgent),
    discoveredModelsByAgentByHost: nestedCapabilityMapToProto(value.discoveredModelsByAgentByHost),
    selectedThinkingByModel: stringMapToProto(value.selectedThinkingByModel),
    customPrompt: value.customPrompt,
    customAgentCommand: value.customAgentCommand
  })
}

function actionOverrideToProto(value: GitActionOverrideInput) {
  return create(GitAiActionOverrideSchema, {
    agentId: value.agentId ?? undefined,
    commandInputTemplate: value.commandInputTemplate ?? undefined,
    agentArgs: value.agentArgs ?? undefined
  })
}

function actionMapToProto(value: Partial<Record<string, GitActionOverrideInput>> | undefined) {
  const defined = Object.entries(value ?? {}).filter(
    (entry): entry is [string, GitActionOverrideInput] => entry[1] !== undefined
  )
  const entries = defined.map(
    ([operation, action]) => [operation, actionOverrideToProto(action)] as const
  )
  return Object.fromEntries(entries)
}

function modelOverrideMapToProto(
  value: Partial<Record<string, GitModelOverrideInput>> | undefined
) {
  const defined = Object.entries(value ?? {}).filter(
    (entry): entry is [string, GitModelOverrideInput] => entry[1] !== undefined
  )
  const entries = defined.map(
    ([operation, override]) =>
      [
        operation,
        create(GitAiModelOverrideSchema, {
          selectedModelByAgent: stringMapToProto(override.selectedModelByAgent),
          selectedModelByAgentByHost: nestedStringMapToProto(override.selectedModelByAgentByHost),
          selectedThinkingByModel: stringMapToProto(override.selectedThinkingByModel)
        })
      ] as const
  )
  return Object.fromEntries(entries)
}

function sourceControlAiSettingsToProto(
  value: GitSourceControlAiSettingsInput
): ProtocolSourceControlAiSettings {
  return create(GitSourceControlAiSettingsSchema, {
    enabled: value.enabled,
    agentId: value.agentId ?? undefined,
    selectedModelByAgent: stringMapToProto(value.selectedModelByAgent),
    selectedModelByAgentByHost: nestedStringMapToProto(value.selectedModelByAgentByHost),
    discoveredModelsByAgent: capabilityMapToProto(value.discoveredModelsByAgent),
    discoveredModelsByAgentByHost: nestedCapabilityMapToProto(value.discoveredModelsByAgentByHost),
    selectedThinkingByModel: stringMapToProto(value.selectedThinkingByModel),
    customAgentCommand: value.customAgentCommand,
    actions: actionMapToProto(value.actions),
    instructionsByOperation: stringMapToProto(value.instructionsByOperation),
    modelOverridesByOperation: modelOverrideMapToProto(value.modelOverridesByOperation),
    prCreationDefaults: value.prCreationDefaults
      ? create(GitAiPrCreationDefaultsSchema, value.prCreationDefaults)
      : undefined,
    launchActionDefaults: actionMapToProto(value.launchActionDefaults)
  })
}

export type GitGenerationParamsInput = {
  agentId: string
  model: string
  thinkingLevel?: string
  customPrompt?: string
  commandInputTemplate?: string
  agentArgs?: string
  customAgentCommand?: string
  agentCommandOverride?: string
}

export type GitGenerationOverridesInput = {
  agentCommands?: Record<string, string>
  discoveryHostKey?: string
  commitMessageAi?: GitCommitMessageAiSettingsInput
  sourceControlAi?: GitSourceControlAiSettingsInput
  resolvedParams?: GitGenerationParamsInput
}

export function gitGenerationOverridesToProto(
  overrides: GitGenerationOverridesInput
): ProtocolGenerationOverrides {
  return create(GitGenerationOverridesSchema, {
    agentCommands: stringMapToProto(overrides.agentCommands),
    discoveryHostKey: overrides.discoveryHostKey,
    commitMessageAi: overrides.commitMessageAi
      ? commitMessageAiSettingsToProto(overrides.commitMessageAi)
      : undefined,
    sourceControlAi: overrides.sourceControlAi
      ? sourceControlAiSettingsToProto(overrides.sourceControlAi)
      : undefined,
    resolvedParams: overrides.resolvedParams
      ? (create(GitGenerationParamsSchema, overrides.resolvedParams) as ProtocolGenerationParams)
      : undefined
  })
}

import { create } from '@bufbuild/protobuf'

import {
  RepoNullableBoolSchema,
  RepoNullableSourceControlAiSchema,
  RepoNullableStringSchema,
  RepoSourceControlAiOverridesSchema,
  RepoSourceControlModelChoiceSchema,
  type RepoNullableBool,
  type RepoNullableSourceControlAi,
  type RepoNullableString,
  type RepoSourceControlAiOverrides,
  type RepoSourceControlModelChoice
} from '../generated/yiru/runtime/v1/repo_pb.js'
import type { RepoSourceControlAiValue, RepoSourceControlModelChoiceValue } from './repo-types.js'

export function nullableStringInit(value: string | null): RepoNullableString {
  return create(RepoNullableStringSchema, {
    value: value === null ? { case: 'null', value: true } : { case: 'text', value }
  })
}

function nullableBoolInit(value: boolean | null): RepoNullableBool {
  return create(RepoNullableBoolSchema, {
    value: value === null ? { case: 'null', value: true } : { case: 'boolean', value }
  })
}

export function nullableSourceControlAiInit(
  value: RepoSourceControlAiValue | null
): RepoNullableSourceControlAi {
  return create(RepoNullableSourceControlAiSchema, {
    value:
      value === null
        ? { case: 'null', value: true }
        : { case: 'overrides', value: sourceControlAiInit(value) }
  })
}

function sourceControlAiInit(value: RepoSourceControlAiValue): RepoSourceControlAiOverrides {
  return create(RepoSourceControlAiOverridesSchema, {
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
    ...(value.customAgentCommand === undefined
      ? {}
      : { customAgentCommand: value.customAgentCommand }),
    ...(value.modelOverridesByOperation === undefined
      ? {}
      : {
          modelOverridesByOperation: {
            values: Object.fromEntries(
              Object.entries(value.modelOverridesByOperation).map(([operation, choice]) => [
                operation,
                modelChoiceInit(choice)
              ])
            )
          }
        }),
    ...(value.instructionsByOperation === undefined
      ? {}
      : {
          instructionsByOperation: {
            values: Object.fromEntries(
              Object.entries(value.instructionsByOperation).map(([operation, instruction]) => [
                operation,
                nullableStringInit(instruction ?? null)
              ])
            )
          }
        }),
    ...(value.actionOverrides === undefined
      ? {}
      : {
          actionOverrides: {
            values: Object.fromEntries(
              Object.entries(value.actionOverrides).map(([action, override]) => [
                action,
                {
                  ...(override.agentId === undefined
                    ? {}
                    : { agentId: nullableStringInit(override.agentId) }),
                  ...(override.commandInputTemplate === undefined
                    ? {}
                    : { commandInputTemplate: nullableStringInit(override.commandInputTemplate) }),
                  ...(override.agentArgs === undefined
                    ? {}
                    : { agentArgs: nullableStringInit(override.agentArgs) })
                }
              ])
            )
          }
        }),
    ...(value.prCreationDefaults === undefined
      ? {}
      : {
          prCreationDefaults: {
            ...(value.prCreationDefaults.draft === undefined
              ? {}
              : { draft: nullableBoolInit(value.prCreationDefaults.draft) }),
            ...(value.prCreationDefaults.useTemplate === undefined
              ? {}
              : { useTemplate: nullableBoolInit(value.prCreationDefaults.useTemplate) }),
            ...(value.prCreationDefaults.generateDetailsOnOpen === undefined
              ? {}
              : {
                  generateDetailsOnOpen: nullableBoolInit(
                    value.prCreationDefaults.generateDetailsOnOpen
                  )
                }),
            ...(value.prCreationDefaults.openAfterCreate === undefined
              ? {}
              : { openAfterCreate: nullableBoolInit(value.prCreationDefaults.openAfterCreate) })
          }
        })
  })
}

type RepoSourceControlModelChoiceInit = RepoSourceControlModelChoiceValue

function modelChoiceInit(value: RepoSourceControlModelChoiceInit): RepoSourceControlModelChoice {
  return create(RepoSourceControlModelChoiceSchema, {
    ...(value.selectedModelByAgent === undefined
      ? {}
      : { selectedModelByAgent: { values: { ...value.selectedModelByAgent } } }),
    ...(value.selectedModelByAgentByHost === undefined
      ? {}
      : {
          selectedModelByAgentByHost: {
            values: Object.fromEntries(
              definedEntries(value.selectedModelByAgentByHost).map(([host, models]) => [
                host,
                { values: { ...models } }
              ])
            )
          }
        }),
    ...(value.selectedThinkingByModel === undefined
      ? {}
      : { selectedThinkingByModel: { values: { ...value.selectedThinkingByModel } } })
  })
}

function definedEntries<V>(value: Record<string, V | undefined>): [string, V][] {
  return Object.entries(value).filter((entry): entry is [string, V] => entry[1] !== undefined)
}

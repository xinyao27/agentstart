import type { TuiAgent } from '../../agent/types'
import { getCommitMessageModel } from '../catalog/agents'
import { isCustomAgentId } from '../custom-agent'
import { generationFailure, type GenerationFailure } from '../failure'
import { getCommitMessageAgentSpec } from './agents'
import { planCustomCommand, tokenizeCustomCommandTemplate } from './custom-prompt'

// Why: command preview and runtime generation must use identical argv/stdin planning.

export type CommitMessagePlanInput = {
  agentId: TuiAgent | 'custom'
  model: string
  thinkingLevel?: string
  customAgentCommand?: string
  agentCommandOverride?: string
  agentArgs?: string
}

export type CommitMessagePlan = {
  binary: string
  args: string[]
  /** Non-null when the prompt should be piped via stdin. */
  stdinPayload: string | null
  /** Human-readable label used in error prefixes (e.g. "Claude failed: ..."). */
  label: string
}

export type CommitMessagePlanResult = { ok: true; plan: CommitMessagePlan } | GenerationFailure

export function planAgentBinary(
  defaultBinary: string,
  commandOverride: string | undefined
): { ok: true; binary: string; prefixArgs: string[] } | GenerationFailure {
  const command = commandOverride?.trim()
  if (!command) {
    return { ok: true, binary: defaultBinary, prefixArgs: [] }
  }

  const tokenized = tokenizeCustomCommandTemplate(command)
  if (!tokenized.ok) {
    return generationFailure({ code: 'invalid-override' })
  }
  const [binary, ...prefixArgs] = tokenized.tokens
  if (!binary) {
    return generationFailure({ code: 'binary-required', kind: 'override' })
  }
  return { ok: true, binary, prefixArgs }
}

function planAdditionalAgentArgs(
  agentArgs: string | null | undefined
): { ok: true; args: string[] } | GenerationFailure {
  const trimmed = agentArgs?.trim()
  if (!trimmed) {
    return { ok: true, args: [] }
  }
  const tokenized = tokenizeCustomCommandTemplate(trimmed)
  if (!tokenized.ok) {
    return generationFailure({ code: 'invalid-cli-arguments' })
  }
  return { ok: true, args: tokenized.tokens }
}

const CODEX_MODEL_OPTION_ALIASES = ['--model', '-m'] as const

function matchesOption(token: string, aliases: readonly string[]): boolean {
  return aliases.some(
    (alias) =>
      token === alias ||
      token.startsWith(`${alias}=`) ||
      (alias.startsWith('-') &&
        !alias.startsWith('--') &&
        token.startsWith(alias) &&
        token.length > alias.length)
  )
}

function findOptionOccurrence(
  tokens: string[],
  aliases: readonly string[],
  stopAtTerminator: boolean
): { index: number; consumed: number } | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (stopAtTerminator && token === '--') {
      break
    }
    if (!matchesOption(token, aliases)) {
      continue
    }
    const nextToken = tokens[index + 1]
    const consumesNext =
      aliases.includes(token) && nextToken !== undefined && !nextToken.startsWith('-')
    return { index, consumed: consumesNext ? 2 : 1 }
  }
  return null
}

function applyRecipeOptionOverride(args: {
  generatedArgs: string[]
  recipeArgs: string[]
  aliases: readonly string[]
}): { generatedArgs: string[]; recipeArgs: string[] } {
  const recipeOption = findOptionOccurrence(args.recipeArgs, args.aliases, true)
  const generatedOption = findOptionOccurrence(args.generatedArgs, args.aliases, false)
  if (!recipeOption || !generatedOption) {
    return { generatedArgs: args.generatedArgs, recipeArgs: args.recipeArgs }
  }

  const overrideTokens = args.recipeArgs.slice(
    recipeOption.index,
    recipeOption.index + recipeOption.consumed
  )
  return {
    generatedArgs: [
      ...args.generatedArgs.slice(0, generatedOption.index),
      ...overrideTokens,
      ...args.generatedArgs.slice(generatedOption.index + generatedOption.consumed)
    ],
    recipeArgs: [
      ...args.recipeArgs.slice(0, recipeOption.index),
      ...args.recipeArgs.slice(recipeOption.index + recipeOption.consumed)
    ]
  }
}

function insertAdditionalAgentArgs(args: {
  baseArgs: string[]
  agentArgs: string[]
  promptDelivery: 'argv' | 'stdin'
  prompt: string
}): string[] {
  if (!args.agentArgs.length) {
    return args.baseArgs
  }
  const promptPlaceholderIndex = args.baseArgs.lastIndexOf('{prompt}')
  if (promptPlaceholderIndex !== -1) {
    const merged = [...args.baseArgs]
    merged.splice(promptPlaceholderIndex, 0, ...args.agentArgs)
    return merged
  }
  if (
    args.promptDelivery === 'argv' &&
    args.prompt.length > 0 &&
    args.baseArgs.at(-1) === args.prompt
  ) {
    return [...args.baseArgs.slice(0, -1), ...args.agentArgs, args.prompt]
  }
  return [...args.baseArgs, ...args.agentArgs]
}

export function planCommitMessageGeneration(
  input: CommitMessagePlanInput,
  prompt: string
): CommitMessagePlanResult {
  if (isCustomAgentId(input.agentId)) {
    const command = input.customAgentCommand?.trim() ?? ''
    if (!command) {
      return generationFailure({ code: 'custom-command-empty', location: 'commit-settings' })
    }
    const planned = planCustomCommand(command, prompt)
    if (!planned.ok) {
      return planned
    }
    const agentArgs = planAdditionalAgentArgs(input.agentArgs)
    if (!agentArgs.ok) {
      return agentArgs
    }
    return {
      ok: true,
      plan: {
        binary: planned.binary,
        args: insertAdditionalAgentArgs({
          baseArgs: planned.args,
          agentArgs: agentArgs.args,
          promptDelivery: planned.stdinPayload === null ? 'argv' : 'stdin',
          prompt
        }),
        stdinPayload: planned.stdinPayload,
        // Why: a custom command has no friendly name, so the binary doubles
        // as the label in error prefixes ("ollama failed: ...").
        label: planned.binary
      }
    }
  }

  const spec = getCommitMessageAgentSpec(input.agentId)
  if (!spec) {
    return generationFailure({ code: 'unsupported-agent', agent: input.agentId })
  }
  const model = getCommitMessageModel(input.agentId, input.model)
  const usesDynamicAgentDefault = input.agentId === 'pi' && input.model.trim().length === 0
  if (!model && !usesDynamicAgentDefault) {
    return generationFailure({ code: 'unavailable-model', model: input.model, agent: spec.label })
  }
  if (input.thinkingLevel) {
    if (!model?.thinkingLevels && spec.modelSource !== 'dynamic') {
      return generationFailure({ code: 'unsupported-thinking', model: model?.label ?? input.model })
    }
    if (
      model?.thinkingLevels &&
      !model.thinkingLevels.some((level) => level.id === input.thinkingLevel)
    ) {
      return generationFailure({
        code: 'invalid-thinking',
        level: input.thinkingLevel,
        model: model.label
      })
    }
  }

  const argvPrompt = spec.promptDelivery === 'argv' ? prompt : ''
  const baseArgs = spec.buildArgs({
    prompt: argvPrompt,
    model: input.model,
    thinkingLevel: input.thinkingLevel
  })
  const agentArgs = planAdditionalAgentArgs(input.agentArgs)
  if (!agentArgs.ok) {
    return agentArgs
  }
  // Why: Codex rejects repeated singleton model flags. Recipe CLI arguments
  // are the more specific setting, so they replace AgentStart's generated model.
  const overriddenArgs =
    input.agentId === 'codex'
      ? applyRecipeOptionOverride({
          generatedArgs: baseArgs,
          recipeArgs: agentArgs.args,
          aliases: CODEX_MODEL_OPTION_ALIASES
        })
      : { generatedArgs: baseArgs, recipeArgs: agentArgs.args }
  const args = insertAdditionalAgentArgs({
    baseArgs: overriddenArgs.generatedArgs,
    agentArgs: overriddenArgs.recipeArgs,
    promptDelivery: spec.promptDelivery,
    prompt: argvPrompt
  })
  const command = planAgentBinary(spec.binary, input.agentCommandOverride)
  if (!command.ok) {
    return command
  }
  return {
    ok: true,
    plan: {
      binary: command.binary,
      args: [...command.prefixArgs, ...args],
      stdinPayload: spec.promptDelivery === 'stdin' ? prompt : null,
      label: spec.label
    }
  }
}

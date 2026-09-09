import type { TuiAgent } from '../agent/types.js'

export type TerminalQuickCommandScope = { type: 'global' } | { type: 'repo'; repoId: string }

export type TerminalQuickCommandAction = 'terminal-command' | 'agent-prompt'

export type TerminalQuickCommandBase = {
  id: string
  label: string
  scope?: TerminalQuickCommandScope
}

export type TerminalCommandQuickCommand = TerminalQuickCommandBase & {
  action?: 'terminal-command'
  command: string
  appendEnter: boolean
}

export type TerminalAgentQuickCommand = TerminalQuickCommandBase & {
  action: 'agent-prompt'
  agent: TuiAgent
  prompt: string
}

export type TerminalQuickCommand = TerminalCommandQuickCommand | TerminalAgentQuickCommand

export type TerminalQuickCommandMutation =
  | { type: 'upsert'; command: TerminalQuickCommand }
  | { type: 'delete'; id: string }

export const MAX_QUICK_COMMANDS = 40
export const MAX_QUICK_COMMAND_ID_LENGTH = 80
export const MAX_QUICK_COMMAND_LABEL_LENGTH = 80
export const MAX_QUICK_COMMAND_REPO_ID_LENGTH = 200
export const MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH = 4000
// Why: startup prompts pass through Windows shell quoting before agent launch.
export const MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH = 6000

const REMOVED_PRESET_IDS = new Set(['default-pwd', 'default-git-status'])
const DEFAULT_TERMINAL_QUICK_COMMANDS: TerminalQuickCommand[] = []

// Why: stdin-after-start agents cannot receive a prompt safely before remote,
// WSL, or native TUI readiness; quick commands only use startup-capable agents.
const TERMINAL_AGENT_QUICK_COMMAND_AGENTS = new Set<TuiAgent>([
  'claude',
  'openclaude',
  'codex',
  'opencode',
  'mimo-code',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'command-code',
  'cursor',
  'droid',
  'hermes',
  'copilot',
  'grok'
])

export function supportsTerminalAgentQuickCommand(
  agent: unknown
): agent is TerminalAgentQuickCommand['agent'] {
  return TERMINAL_AGENT_QUICK_COMMAND_AGENTS.has(agent as TuiAgent)
}

export function getDefaultTerminalQuickCommands(): TerminalQuickCommand[] {
  return DEFAULT_TERMINAL_QUICK_COMMANDS.map((command) => ({ ...command }))
}

function normalizeTerminalQuickCommandScope(input: unknown): TerminalQuickCommandScope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { type: 'global' }
  }
  const record = input as Record<string, unknown>
  if (record.type !== 'repo') {
    return { type: 'global' }
  }
  const repoId = typeof record.repoId === 'string' ? record.repoId.trim() : ''
  return repoId
    ? { type: 'repo', repoId: repoId.slice(0, MAX_QUICK_COMMAND_REPO_ID_LENGTH) }
    : { type: 'global' }
}

export function getTerminalQuickCommandScope(
  command: TerminalQuickCommand
): TerminalQuickCommandScope {
  return normalizeTerminalQuickCommandScope(command.scope)
}

export function terminalQuickCommandMatchesRepo(
  command: TerminalQuickCommand,
  repoId: string | null
): boolean {
  const scope = getTerminalQuickCommandScope(command)
  return scope.type === 'global' || (repoId !== null && scope.repoId === repoId)
}

export function getTerminalQuickCommandAction(
  command: TerminalQuickCommand
): TerminalQuickCommandAction {
  return command.action === 'agent-prompt' ? 'agent-prompt' : 'terminal-command'
}

export function isTerminalAgentQuickCommand(
  command: TerminalQuickCommand
): command is TerminalAgentQuickCommand {
  return getTerminalQuickCommandAction(command) === 'agent-prompt'
}

export function getTerminalQuickCommandBody(command: TerminalQuickCommand): string {
  return isTerminalAgentQuickCommand(command) ? command.prompt : command.command
}

export function isTerminalQuickCommandComplete(command: TerminalQuickCommand): boolean {
  return command.label.trim().length > 0 && getTerminalQuickCommandBody(command).trim().length > 0
}

export function normalizeTerminalQuickCommands(input: unknown): TerminalQuickCommand[] {
  if (!Array.isArray(input)) {
    return getDefaultTerminalQuickCommands()
  }

  const normalized: TerminalQuickCommand[] = []
  const seenIds = new Set<string>()
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const record = item as Record<string, unknown>
    const rawId = typeof record.id === 'string' ? record.id.trim() : ''
    if (REMOVED_PRESET_IDS.has(rawId)) {
      continue
    }
    const hasLabel = typeof record.label === 'string'
    const hasCommand = typeof record.command === 'string'
    const hasPrompt = typeof record.prompt === 'string'
    if (!hasLabel && !hasCommand && !hasPrompt) {
      continue
    }
    const action: TerminalQuickCommandAction =
      record.action === 'agent-prompt' ? 'agent-prompt' : 'terminal-command'
    const agent = supportsTerminalAgentQuickCommand(record.agent) ? record.agent : null
    if (action === 'agent-prompt' && agent === null) {
      continue
    }

    const idBase = rawId || `quick-command-${normalized.length + 1}`
    let id = idBase.slice(0, MAX_QUICK_COMMAND_ID_LENGTH)
    let suffix = 2
    while (seenIds.has(id)) {
      id = `${idBase.slice(0, MAX_QUICK_COMMAND_ID_LENGTH - 4)}-${suffix}`
      suffix += 1
    }
    seenIds.add(id)
    const base = {
      id,
      label: (hasLabel ? String(record.label).trim() : '').slice(0, MAX_QUICK_COMMAND_LABEL_LENGTH),
      scope: normalizeTerminalQuickCommandScope(record.scope)
    }

    normalized.push(
      action === 'agent-prompt' && agent
        ? {
            ...base,
            action,
            agent,
            prompt: (hasPrompt ? String(record.prompt).trimEnd() : '').slice(
              0,
              MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH
            )
          }
        : {
            ...base,
            action: 'terminal-command',
            command: (hasCommand ? String(record.command).trimEnd() : '').slice(
              0,
              MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH
            ),
            appendEnter: record.appendEnter !== false
          }
    )
    if (normalized.length >= MAX_QUICK_COMMANDS) {
      break
    }
  }
  return normalized
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record)
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(record, key))
}

function isNormalizedScope(value: unknown, expected: TerminalQuickCommandScope): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const scope = value as Record<string, unknown>
  return expected.type === 'global'
    ? hasExactKeys(scope, ['type']) && scope.type === 'global'
    : hasExactKeys(scope, ['type', 'repoId']) &&
        scope.type === 'repo' &&
        scope.repoId === expected.repoId
}

function isNormalizedCommand(value: unknown, expected: TerminalQuickCommand): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const command = value as Record<string, unknown>
  if (
    command.id !== expected.id ||
    command.label !== expected.label ||
    !isNormalizedScope(command.scope, expected.scope ?? { type: 'global' })
  ) {
    return false
  }
  return isTerminalAgentQuickCommand(expected)
    ? hasExactKeys(command, ['id', 'label', 'action', 'agent', 'prompt', 'scope']) &&
        command.action === 'agent-prompt' &&
        command.agent === expected.agent &&
        command.prompt === expected.prompt
    : hasExactKeys(command, ['id', 'label', 'action', 'command', 'appendEnter', 'scope']) &&
        command.action === 'terminal-command' &&
        command.command === expected.command &&
        command.appendEnter === expected.appendEnter
}

// Why: authoritative payloads must not change under normalization, or a later
// targeted mutation could silently persist a lossy client interpretation.
export function parseNormalizedTerminalQuickCommands(
  input: unknown
): TerminalQuickCommand[] | null {
  if (!Array.isArray(input) || input.length > MAX_QUICK_COMMANDS) {
    return null
  }
  const normalized = normalizeTerminalQuickCommands(input)
  return normalized.length === input.length &&
    normalized.every((command, index) => isNormalizedCommand(input[index], command))
    ? normalized
    : null
}

export function applyTerminalQuickCommandMutation(
  commands: readonly TerminalQuickCommand[],
  mutation: TerminalQuickCommandMutation
): TerminalQuickCommand[] {
  if (mutation.type === 'delete') {
    return commands.filter((command) => command.id !== mutation.id)
  }
  const existingIndex = commands.findIndex((command) => command.id === mutation.command.id)
  return existingIndex === -1
    ? [...commands, mutation.command]
    : commands.map((command, index) => (index === existingIndex ? mutation.command : command))
}

export function buildTerminalQuickCommandInput(command: TerminalCommandQuickCommand): string {
  return command.appendEnter ? `${command.command}\r` : command.command
}

const LINE_BREAK_RE = /\r\n|\r|\n/

// Why: one shell command list keeps later saved lines from becoming stdin for
// a foreground command started by an earlier line.
export function flattenTerminalQuickCommand(
  command: TerminalCommandQuickCommand
): TerminalCommandQuickCommand {
  return LINE_BREAK_RE.test(command.command)
    ? {
        ...command,
        command: command.command
          .split(LINE_BREAK_RE)
          .map((line) => line.trim())
          .filter(Boolean)
          .join('; ')
      }
    : command
}

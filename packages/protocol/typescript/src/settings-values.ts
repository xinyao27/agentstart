import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  type SettingsGhosttyImportPreview as ProtocolGhosttyPreview,
  type SettingsJsonValue as ProtocolJsonValue,
  type SettingsJsonValueEntry as ProtocolJsonValueEntry,
  type SettingsQuickCommand as ProtocolQuickCommand,
  type SettingsSnapshot as ProtocolSnapshot,
  type SettingsWarpThemeImportPreview as ProtocolWarpPreview,
  SettingsWarpImportKind,
  SettingsWarpThemeMode as ProtocolThemeMode,
  SettingsWarpThemeSource as ProtocolThemeSource
} from '../generated/agent_start/runtime/v1/settings_pb.js'
import { RuntimeProtocolError } from './error.js'

export const SETTINGS_PROTOCOL_CAPABILITY = 'settings.protobuf.v1' as const

// Why: theme diffs and import previews are open-ended key-value pairs whose
// value kinds the theme file decides, so the wire's recursive JSON value
// decodes into the equally open recursive union the renderer already models.
export type SettingsJsonValue =
  | string
  | number
  | boolean
  | null
  | SettingsJsonValue[]
  | { [key: string]: SettingsJsonValue }

export type SettingsSnapshotValue = {
  defaultTuiAgent: string | null
  disabledTuiAgents: string[]
  agentCmdOverrides: Record<string, string>
  agentDefaultArgs: Record<string, string>
  agentDefaultEnv: Record<string, Record<string, string>>
  agentStatusHooksEnabled: boolean
  minimaxGroupId: string
  minimaxUsageModels: string
  prBotAuthorOverrides: string[]
}

export type TerminalQuickCommandScope = { type: 'global' } | { type: 'repo'; repoId: string }

export type TerminalQuickCommand =
  | {
      id: string
      label: string
      action: 'terminal-command'
      command: string
      appendEnter: boolean
      scope?: TerminalQuickCommandScope
    }
  | {
      id: string
      label: string
      action: 'agent-prompt'
      agent: string
      prompt: string
      scope?: TerminalQuickCommandScope
    }

export type TerminalQuickCommandMutation =
  | { type: 'upsert'; command: TerminalQuickCommand }
  | { type: 'delete'; id: string }

export type GhosttyImportPreviewValue = {
  found: boolean
  configPath?: string
  configPaths?: string[]
  diff: Record<string, SettingsJsonValue>
  unsupportedKeys: string[]
  error?: string
}

export type WarpThemePreviewThemeValue = {
  id: string
  name: string
  source: 'warp' | 'ghostty' | 'manual'
  mode: 'dark' | 'light' | 'unknown'
  terminal: Record<string, SettingsJsonValue>
  importedAt: string
  sourceLabel?: string
  unsupportedFeatures?: string[]
  selectionValue: string
}

export type WarpThemeImportPreviewValue = {
  found: boolean
  canceled?: boolean
  desktopOnly?: boolean
  sourceLabel?: string
  themes: WarpThemePreviewThemeValue[]
  skippedFiles: { label: string; reason: string }[]
  error?: string
}

export type SettingsUpdatePatch = Readonly<{
  // Why: `undefined` leaves the stored value untouched while `null` clears it,
  // matching the update request's per-field presence instead of a full replace.
  defaultTuiAgent?: string | null
  disabledTuiAgents?: string[]
  agentDefaultArgs?: Record<string, string>
  agentDefaultEnv?: Record<string, Record<string, string>>
  agentStatusHooksEnabled?: boolean
  minimaxGroupId?: string
  minimaxUsageModels?: string
  prBotAuthorOverrides?: string[]
}>

export type WarpImportKindInput = 'auto' | 'chooseFile' | 'chooseFolder'

export function decodeSettingsSnapshot(
  snapshot: ProtocolSnapshot | undefined
): SettingsSnapshotValue {
  if (!snapshot) {
    throw invalidResponse('Settings snapshot is missing')
  }
  const agentDefaultEnv: Record<string, Record<string, string>> = {}
  for (const entry of snapshot.agentDefaultEnv) {
    agentDefaultEnv[entry.agent] = { ...entry.vars }
  }
  return {
    defaultTuiAgent: defaultTuiAgent(snapshot.defaultTuiAgent),
    disabledTuiAgents: [...snapshot.disabledTuiAgents],
    agentCmdOverrides: { ...snapshot.agentCmdOverrides },
    agentDefaultArgs: { ...snapshot.agentDefaultArgs },
    agentDefaultEnv,
    agentStatusHooksEnabled: snapshot.agentStatusHooksEnabled,
    minimaxGroupId: snapshot.minimaxGroupId,
    minimaxUsageModels: snapshot.minimaxUsageModels,
    prBotAuthorOverrides: [...snapshot.prBotAuthorOverrides]
  }
}

export function decodeQuickCommands(commands: ProtocolQuickCommand[]): TerminalQuickCommand[] {
  return commands.map(quickCommand)
}

export function decodeGhosttyPreview(
  preview: ProtocolGhosttyPreview | undefined
): GhosttyImportPreviewValue {
  if (!preview) {
    throw invalidResponse('Ghostty import preview is missing')
  }
  return {
    found: preview.found,
    ...(preview.configPath ? { configPath: preview.configPath } : {}),
    configPaths: [...preview.configPaths],
    diff: jsonEntries(preview.diff),
    unsupportedKeys: [...preview.unsupportedKeys],
    ...(preview.error ? { error: preview.error } : {})
  }
}

export function decodeWarpPreview(
  preview: ProtocolWarpPreview | undefined
): WarpThemeImportPreviewValue {
  if (!preview) {
    throw invalidResponse('Warp theme import preview is missing')
  }
  return {
    found: preview.found,
    ...(preview.canceled !== undefined ? { canceled: preview.canceled } : {}),
    ...(preview.desktopOnly !== undefined ? { desktopOnly: preview.desktopOnly } : {}),
    ...(preview.sourceLabel ? { sourceLabel: preview.sourceLabel } : {}),
    themes: preview.themes.map(warpTheme),
    skippedFiles: preview.skippedFiles.map((file) => ({ label: file.label, reason: file.reason })),
    ...(preview.error ? { error: preview.error } : {})
  }
}

export function decodeJsonValue(value: ProtocolJsonValue | undefined): SettingsJsonValue {
  const kind = value?.kind
  if (!kind) {
    throw invalidResponse('Settings JSON value is missing')
  }
  switch (kind.case) {
    case 'nullValue':
      return null
    case 'boolValue':
      return kind.value
    case 'numberValue':
      return kind.value
    case 'stringValue':
      return kind.value
    case 'listValue':
      return kind.value.values.map(decodeJsonValue)
    case 'objectValue':
      return jsonEntries(kind.value.entries)
  }
  throw invalidResponse('Settings JSON value kind is unknown')
}

function defaultTuiAgent(value: ProtocolSnapshot['defaultTuiAgent']): string | null {
  const kind = value?.value
  if (!kind) {
    return null
  }
  return kind.case === 'agent' ? kind.value : null
}

function quickCommand(command: ProtocolQuickCommand): TerminalQuickCommand {
  const scope = quickCommandScope(command.scope)
  const base = {
    id: command.id,
    label: command.label,
    ...(scope ? { scope } : {})
  }
  switch (command.kind?.case) {
    case 'terminalCommand':
      return {
        ...base,
        action: 'terminal-command',
        command: command.kind.value.command,
        appendEnter: command.kind.value.appendEnter
      }
    case 'agentPrompt':
      return {
        ...base,
        action: 'agent-prompt',
        agent: command.kind.value.agent,
        prompt: command.kind.value.prompt
      }
    case undefined:
      throw invalidResponse('Quick command kind is missing')
  }
  throw invalidResponse('Quick command kind is unknown')
}

function quickCommandScope(
  scope: ProtocolQuickCommand['scope']
): TerminalQuickCommandScope | undefined {
  const kind = scope?.scope
  if (!kind) {
    return undefined
  }
  switch (kind.case) {
    case 'global':
      return { type: 'global' }
    case 'repoId':
      return { type: 'repo', repoId: kind.value }
  }
  return undefined
}

function warpTheme(theme: ProtocolWarpPreview['themes'][number]): WarpThemePreviewThemeValue {
  return {
    id: theme.id,
    name: theme.name,
    source: themeSource(theme.source),
    mode: themeMode(theme.mode),
    terminal: jsonEntries(theme.terminal),
    importedAt: theme.importedAt,
    ...(theme.sourceLabel ? { sourceLabel: theme.sourceLabel } : {}),
    unsupportedFeatures: [...theme.unsupportedFeatures],
    selectionValue: theme.selectionValue
  }
}

function themeSource(value: number): WarpThemePreviewThemeValue['source'] {
  switch (value) {
    case ProtocolThemeSource.WARP:
      return 'warp'
    case ProtocolThemeSource.GHOSTTY:
      return 'ghostty'
    case ProtocolThemeSource.MANUAL:
      return 'manual'
    case ProtocolThemeSource.UNSPECIFIED:
      throw invalidResponse('Theme source is unspecified')
  }
  throw invalidResponse('Theme source is unknown')
}

function themeMode(value: number): WarpThemePreviewThemeValue['mode'] {
  switch (value) {
    case ProtocolThemeMode.DARK:
      return 'dark'
    case ProtocolThemeMode.LIGHT:
      return 'light'
    case ProtocolThemeMode.UNKNOWN:
      return 'unknown'
    case ProtocolThemeMode.UNSPECIFIED:
      throw invalidResponse('Theme mode is unspecified')
  }
  throw invalidResponse('Theme mode is unknown')
}

function jsonEntries(
  entries: readonly ProtocolJsonValueEntry[]
): Record<string, SettingsJsonValue> {
  const record: Record<string, SettingsJsonValue> = {}
  for (const entry of entries) {
    record[entry.key] = decodeJsonValue(entry.value)
  }
  return record
}

export function warpImportKind(value: WarpImportKindInput): SettingsWarpImportKind {
  switch (value) {
    case 'auto':
      return SettingsWarpImportKind.AUTO
    case 'chooseFile':
      return SettingsWarpImportKind.CHOOSE_FILE
    case 'chooseFolder':
      return SettingsWarpImportKind.CHOOSE_FOLDER
  }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

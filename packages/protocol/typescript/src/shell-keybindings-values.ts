import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ShellKeybindingsPlatform,
  ShellKeybindingsSeverity,
  type ShellKeybindingsSnapshot
} from '../generated/yiru/runtime/v1/shell_keybindings_pb.js'
import { RuntimeProtocolError } from './error.js'

export const SHELL_KEYBINDINGS_PROTOCOL_CAPABILITY = 'shell.keybindings.protobuf.v1' as const

// Why: Override maps retain unknown action IDs as entries so newer host actions survive older clients.
export type ShellKeybindingsOverrideEntryValue = { actionId: string; bindings: string[] }
export type ShellKeybindingsOverrideMapValue = { entries: ShellKeybindingsOverrideEntryValue[] }
export type ShellKeybindingsDiagnosticValue = {
  severity: 'warning' | 'error'
  message: string
  actionId?: string
  section?: string
}
export type ShellKeybindingsPlatformValue = 'darwin' | 'linux' | 'win32'
export type ShellKeybindingsSnapshotValue = {
  path: string
  platform: ShellKeybindingsPlatformValue
  exists: boolean
  overrides: ShellKeybindingsOverrideMapValue
  commonOverrides: ShellKeybindingsOverrideMapValue
  platformOverrides: Partial<
    Record<ShellKeybindingsPlatformValue, ShellKeybindingsOverrideMapValue>
  >
  diagnostics: ShellKeybindingsDiagnosticValue[]
}

export function shellKeybindingsSnapshot(
  value: ShellKeybindingsSnapshot
): ShellKeybindingsSnapshotValue {
  return {
    path: value.path,
    platform: platform(value.platform),
    exists: value.exists,
    overrides: overrideMap(value.overrides),
    commonOverrides: overrideMap(value.commonOverrides),
    platformOverrides: platformOverrides(value.platformOverrides),
    diagnostics: value.diagnostics.map(diagnostic)
  }
}

function overrideMap(
  value: ShellKeybindingsSnapshot['overrides']
): ShellKeybindingsOverrideMapValue {
  return {
    entries: (value?.entries ?? []).map((entry) => ({
      actionId: entry.actionId,
      bindings: [...entry.bindings]
    }))
  }
}

function platformOverrides(
  value: ShellKeybindingsSnapshot['platformOverrides']
): ShellKeybindingsSnapshotValue['platformOverrides'] {
  const output: ShellKeybindingsSnapshotValue['platformOverrides'] = {}
  if (value === undefined) {
    return output
  }
  assign(output, 'darwin', optionalMap(value.darwin))
  assign(output, 'linux', optionalMap(value.linux))
  assign(output, 'win32', optionalMap(value.win32))
  return output
}

function optionalMap(
  value: ShellKeybindingsSnapshot['overrides']
): ShellKeybindingsOverrideMapValue | undefined {
  return value === undefined ? undefined : overrideMap(value)
}

function assign(
  target: ShellKeybindingsSnapshotValue['platformOverrides'],
  key: ShellKeybindingsPlatformValue,
  value: ShellKeybindingsOverrideMapValue | undefined
): void {
  if (value !== undefined) {
    target[key] = value
  }
}

function diagnostic(
  value: ShellKeybindingsSnapshot['diagnostics'][number]
): ShellKeybindingsDiagnosticValue {
  return {
    severity: severity(value.severity),
    message: value.message,
    ...(value.actionId === undefined ? {} : { actionId: value.actionId }),
    ...(value.section === undefined ? {} : { section: value.section })
  }
}

function platform(value: ShellKeybindingsPlatform): ShellKeybindingsPlatformValue {
  switch (value) {
    case ShellKeybindingsPlatform.DARWIN:
      return 'darwin'
    case ShellKeybindingsPlatform.LINUX:
      return 'linux'
    case ShellKeybindingsPlatform.WIN32:
      return 'win32'
    case ShellKeybindingsPlatform.UNSPECIFIED:
      break
  }
  throw invalidResponse('Shell keybindings platform is missing')
}

function severity(value: ShellKeybindingsSeverity): ShellKeybindingsDiagnosticValue['severity'] {
  switch (value) {
    case ShellKeybindingsSeverity.WARNING:
      return 'warning'
    case ShellKeybindingsSeverity.ERROR:
      return 'error'
    case ShellKeybindingsSeverity.UNSPECIFIED:
      break
  }
  throw invalidResponse('Shell keybindings diagnostic severity is missing')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

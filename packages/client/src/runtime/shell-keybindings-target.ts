import { SHELL_KEYBINDINGS_PROTOCOL_CAPABILITY, ShellKeybindingsClient } from '@agentstart/protocol'
import type { ShellKeybindingsSnapshotValue } from '@agentstart/protocol'
import { isKeybindingActionId } from '@agentstart/protocol/keybindings'
import type { KeybindingFileSnapshot, KeybindingOverrides } from '@agentstart/protocol/keybindings'
import { translate } from '~renderer/i18n/i18n'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

async function openShellKeybindingsTarget(): Promise<ShellKeybindingsClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(SHELL_KEYBINDINGS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ShellKeybindingsClient(await openConfiguredBrowserHostProtocol())
}

// Why: the keybindings namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireShellKeybindingsClient(): Promise<ShellKeybindingsClient> {
  const client = await openShellKeybindingsTarget()
  if (!client) {
    throw new Error(
      translate(
        'runtime.shellKeybindingsTarget.unavailable',
        'Keyboard shortcuts need a current AgentStart daemon connection.'
      )
    )
  }
  return client
}

export function keybindingFileSnapshot(
  value: ShellKeybindingsSnapshotValue
): KeybindingFileSnapshot {
  const { platformOverrides } = value
  return {
    path: value.path,
    platform: value.platform,
    exists: value.exists,
    overrides: keybindingOverrides(value.overrides),
    commonOverrides: keybindingOverrides(value.commonOverrides),
    platformOverrides: {
      ...(platformOverrides.darwin
        ? { darwin: keybindingOverrides(platformOverrides.darwin) }
        : {}),
      ...(platformOverrides.linux ? { linux: keybindingOverrides(platformOverrides.linux) } : {}),
      ...(platformOverrides.win32 ? { win32: keybindingOverrides(platformOverrides.win32) } : {})
    },
    diagnostics: value.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.actionId === undefined ? {} : { actionId: diagnostic.actionId }),
      ...(diagnostic.section === undefined ? {} : { section: diagnostic.section })
    }))
  }
}

// Why: the renderer can only reference action ids it compiles, so entries with
// unknown ids stay inert here exactly as if the daemon had never sent them.
function keybindingOverrides(
  value: ShellKeybindingsSnapshotValue['overrides']
): KeybindingOverrides {
  const overrides: KeybindingOverrides = {}
  for (const entry of value.entries) {
    if (isKeybindingActionId(entry.actionId)) {
      overrides[entry.actionId] = entry.bindings
    }
  }
  return overrides
}

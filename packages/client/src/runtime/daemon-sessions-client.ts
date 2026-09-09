import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

import { getActiveRuntimeTarget } from './rpc-client'
import { openRuntimeTerminalClient } from './terminal-protocol'

type RuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

// Why: killAll polls the daemon past its SIGTERM→SIGKILL ladder (~6.5s), so it
// needs a window well beyond the default call timeout.
const KILL_ALL_TIMEOUT_MS = 30_000

export async function listRuntimeDaemonSessions(settings?: RuntimeSettings) {
  const client = await openRuntimeTerminalClient(getActiveRuntimeTarget(settings))
  return client.listManagedSessions()
}

export async function killAllRuntimeDaemonSessions(settings?: RuntimeSettings) {
  const client = await openRuntimeTerminalClient(getActiveRuntimeTarget(settings))
  return client.killAllManaged({ timeoutMs: KILL_ALL_TIMEOUT_MS })
}

export async function killRuntimeDaemonSession(sessionId: string, settings?: RuntimeSettings) {
  const client = await openRuntimeTerminalClient(getActiveRuntimeTarget(settings))
  return client.killManaged(sessionId)
}

export async function restartRuntimeDaemon(settings?: RuntimeSettings) {
  const client = await openRuntimeTerminalClient(getActiveRuntimeTarget(settings))
  return client.restartManaged()
}

// Why: the daemon's own PTY session registry, as opposed to the terminal panes
// a workspace owns — derived from the client call so this feature has no
// separately maintained type to drift from the wire shape.
export type RuntimeDaemonSession = Awaited<
  ReturnType<typeof listRuntimeDaemonSessions>
>['sessions'][number]

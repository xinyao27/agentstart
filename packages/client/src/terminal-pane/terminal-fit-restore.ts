import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { runtimePtyEnvironmentId, runtimePtyHandle } from '@agentstart/protocol/terminal-identity'
import { mapWithConcurrency } from '~renderer/map-with-concurrency'
import { shellClient } from '~renderer/runtime/shell-client'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'

type TerminalFitRestoreSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | undefined

// Why: "take back all terminals" can target a phone that controls hundreds of
// PTYs. Fanning out one IPC/RPC reclaim per PTY unbounded would burst the
// runtime transport; cap the in-flight reclaims so a huge session degrades to
// steady throughput instead of a thundering herd. Each reclaim is a short
// round-trip, so a modest pool keeps latency low without overwhelming it.
const RESTORE_FIT_CONCURRENCY = 8

const restoreFailedResult = (): { restored: boolean } => {
  // Why: terminal fit restore is best-effort when mobile/remote transports disappear.
  return { restored: false }
}

export async function restoreTerminalFitToDesktop(
  ptyId: string,
  settings: TerminalFitRestoreSettings
): Promise<boolean> {
  const remoteHandle = runtimePtyHandle(ptyId)
  const environmentId =
    runtimePtyEnvironmentId(ptyId) ?? settings?.activeRuntimeEnvironmentId ?? null
  const result =
    remoteHandle && environmentId
      ? await openRuntimeTerminalClient({ kind: 'environment', environmentId })
          .then((client) => client.restoreFit(remoteHandle, { timeoutMs: 15_000 }))
          .catch(restoreFailedResult)
      : await shellClient.runtime.restoreTerminalFit(ptyId).catch(restoreFailedResult)

  return result.restored
}

export async function restoreTerminalFitsToDesktop(
  ptyIds: Iterable<string>,
  settings: TerminalFitRestoreSettings
): Promise<boolean> {
  const uniquePtyIds = [...new Set(ptyIds)]
  const results = await mapWithConcurrency(uniquePtyIds, RESTORE_FIT_CONCURRENCY, (ptyId) =>
    restoreTerminalFitToDesktop(ptyId, settings)
  )
  return results.some(Boolean)
}

import { DiagnosticsClient } from '@yiru/protocol'
import type { MemorySnapshot } from '@yiru/protocol/diagnostics/memory-values'
import { readConfiguredBrowserHostDiagnostics } from '~renderer/runtime/browser-host-runtime'
import { mapProtocolMemorySnapshot } from '~renderer/runtime/memory-snapshot'
import { openRuntimeProtocolTarget } from '~renderer/runtime/protocol-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

export function readRuntimeMemorySnapshot(target: RuntimeClientTarget): Promise<MemorySnapshot> {
  if (target.kind === 'local') {
    return readConfiguredBrowserHostDiagnostics()
  }
  return readRemoteRuntimeMemorySnapshot(target)
}

async function readRemoteRuntimeMemorySnapshot(
  target: RuntimeClientTarget
): Promise<MemorySnapshot> {
  const client = new DiagnosticsClient(await openRuntimeProtocolTarget(target))
  return mapProtocolMemorySnapshot(await client.getMemorySnapshot({ timeoutMs: 15_000 }))
}

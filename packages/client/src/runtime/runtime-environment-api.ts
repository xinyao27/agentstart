import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import type { RuntimeStatus } from '~renderer/runtime/status/model'

export type RuntimeEnvironmentApi = {
  list: () => Promise<PublicKnownRuntimeEnvironment[]>
  remove: (args: { selector: string }) => Promise<{ removed: PublicKnownRuntimeEnvironment }>
  disconnect: (args: {
    selector: string
  }) => Promise<{ disconnected: PublicKnownRuntimeEnvironment }>
  getStatus: (args: { selector: string; timeoutMs?: number }) => Promise<RuntimeStatus>
}

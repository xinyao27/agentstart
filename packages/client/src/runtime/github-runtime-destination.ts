import type { RuntimeCallOptions } from '@yiru/protocol'

import type { RuntimeClientTarget } from './runtime-target'

// Why: Calls share a local connection; the destination scopes each GitHub request to its selected runtime.
export function runtimeCallDestination(
  target: RuntimeClientTarget
): Pick<RuntimeCallOptions, 'destination'> {
  return target.kind === 'environment'
    ? { destination: { environmentId: target.environmentId } }
    : {}
}

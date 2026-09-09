import type { RuntimeClientTarget } from '../runtime-target'
import { RemoteRuntimeTerminalMultiplexer } from './multiplexer'

const multiplexers = new Map<string, RemoteRuntimeTerminalMultiplexer>()

export function getRuntimeTerminalMultiplexer(
  target: RuntimeClientTarget
): RemoteRuntimeTerminalMultiplexer {
  const targetKey = target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
  let multiplexer = multiplexers.get(targetKey)
  if (!multiplexer) {
    multiplexer = new RemoteRuntimeTerminalMultiplexer(target, targetKey, (id, current) => {
      if (multiplexers.get(id) === current) {
        multiplexers.delete(id)
      }
    })
    multiplexers.set(targetKey, multiplexer)
  }
  return multiplexer
}

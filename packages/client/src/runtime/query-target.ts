import type { RuntimeClientTarget } from './rpc-client'

export function targetKey(target: RuntimeClientTarget): string {
  return target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
}

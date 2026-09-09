import { TerminalClient } from '@yiru/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'

export async function openRuntimeTerminalClient(
  target: RuntimeClientTarget
): Promise<TerminalClient> {
  return new TerminalClient(await openRuntimeProtocolTarget(target))
}

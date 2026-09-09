import { TerminalFitClient } from '@yiru/protocol'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'

export async function openTerminalFitTarget(): Promise<TerminalFitClient> {
  return new TerminalFitClient(await openConfiguredBrowserHostProtocol())
}

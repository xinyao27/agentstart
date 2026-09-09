import { DiagnosticsClient } from '@yiru/protocol'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'

export async function openDiagnosticsTarget(): Promise<DiagnosticsClient> {
  return new DiagnosticsClient(await openConfiguredBrowserHostProtocol())
}

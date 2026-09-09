import { SHELL_FILES_PROTOCOL_CAPABILITY, ShellFilesClient } from '@yiru/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

// Why: `shell.files` always addresses the OS host running the current Chrome
// client (never the selected runtime environment), so this reaches the local
// protocol channel directly, preserving its local-only routing policy.
export async function openShellFilesTarget(): Promise<ShellFilesClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(SHELL_FILES_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ShellFilesClient(await openConfiguredBrowserHostProtocol())
}

// Why: the shell.files namespace has no legacy fallback left to drop into, so
// every call site requires the capability outright instead of silently
// degrading.
export async function requireShellFilesTarget(): Promise<ShellFilesClient> {
  const client = await openShellFilesTarget()
  if (!client) {
    throw new Error('shellFiles.protobuf.v1 capability is not available on this runtime host')
  }
  return client
}

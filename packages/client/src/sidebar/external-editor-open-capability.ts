import { isVsCodeRemoteSshCommand } from './vscode-launcher'

export type ExternalEditorOpenCapability =
  | { allowed: true; remote: boolean }
  | {
      allowed: false
      reason: 'remote-runtime' | 'local-only-editor' | 'runtime-host-unsupported'
    }

export function getExternalEditorOpenCapability(context: {
  runtimeEnvironmentId?: string | null
  connectionId?: string | null
  command?: string
  runtimeRemoteSshSupported?: boolean
}): ExternalEditorOpenCapability {
  const runtimeEnvironmentId = context.runtimeEnvironmentId?.trim()
  const connectionId = context.connectionId?.trim()
  if (!connectionId) {
    return runtimeEnvironmentId
      ? { allowed: false, reason: 'remote-runtime' }
      : { allowed: true, remote: false }
  }
  if (!isVsCodeRemoteSshCommand(context.command)) {
    return { allowed: false, reason: 'local-only-editor' }
  }
  if (runtimeEnvironmentId && context.runtimeRemoteSshSupported !== true) {
    return { allowed: false, reason: 'runtime-host-unsupported' }
  }
  return { allowed: true, remote: true }
}

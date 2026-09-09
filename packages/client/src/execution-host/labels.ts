import type { StartupHostPlatform } from '@yiru/protocol/agent/shell-command'
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  parseExecutionHostId,
  type ExecutionHostScope
} from '@yiru/protocol/host/identity'
import { translate } from '~renderer/i18n/i18n'

function getCurrentLocalPlatform(): StartupHostPlatform | null {
  const userAgent =
    typeof navigator === 'undefined' ? '' : navigator.userAgent || navigator.platform
  if (/Windows/i.test(userAgent)) {
    return 'win32'
  }
  if (/Mac/i.test(userAgent)) {
    return 'darwin'
  }
  if (/Linux|X11/i.test(userAgent)) {
    return 'linux'
  }
  return null
}

export function getLocalExecutionHostLabel(platform: StartupHostPlatform | null = null): string {
  const localPlatform = platform ?? getCurrentLocalPlatform()
  if (localPlatform === 'darwin') {
    return translate('executionHost.localMac', 'Local Mac')
  }
  if (localPlatform === 'win32') {
    return translate('executionHost.localWindows', 'Local Windows')
  }
  if (localPlatform === 'linux') {
    return translate('executionHost.localLinux', 'Local Linux')
  }
  return translate('executionHost.thisComputer', 'This computer')
}

export function getExecutionHostLabel(id: ExecutionHostScope): string {
  if (id === ALL_EXECUTION_HOSTS_SCOPE) {
    return translate('executionHost.allHosts', 'All hosts')
  }
  const parsed = parseExecutionHostId(id)
  if (!parsed) {
    return translate('executionHost.allHosts', 'All hosts')
  }
  switch (parsed.kind) {
    case 'local':
      return getLocalExecutionHostLabel()
    case 'runtime':
      return parsed.environmentId
    case 'ssh':
      return parsed.target
    case 'wsl':
      return translate('executionHost.wsl', 'WSL · {{distribution}}', {
        distribution: parsed.distribution
      })
  }
}

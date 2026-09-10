import type { ExtensionBootstrapResult } from '../bootstrap-response'

export function isLocalDeviceRuntime(bootstrap: ExtensionBootstrapResult): boolean {
  // Why: Native Messaging supplies an expected identity; custom endpoints (including
  // SSH tunnels on localhost) do not prove that their desktop belongs to this browser.
  if (!bootstrap.expectedRuntimeId) {
    return false
  }
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(bootstrap.endpoint).hostname)
  } catch {
    return false
  }
}

export function refreshedRuntimeIdentity(
  expectedRuntimeId: string | null,
  bootstrap: ExtensionBootstrapResult
): string | null {
  return bootstrap.expectedRuntimeId ?? expectedRuntimeId
}

export function remainingRuntimeConnectTimeout(deadline: number): number {
  const timeoutMs = Math.ceil(deadline - performance.now())
  if (timeoutMs <= 0) {
    throw new Error('extension_runtime_connection_timed_out')
  }
  return timeoutMs
}

export function runtimeQueryCacheBuster(bootstrap: ExtensionBootstrapResult): string {
  const endpoint = new URL(bootstrap.endpoint)
  const host = endpoint.hostname.toLowerCase()
  const target = ['127.0.0.1', 'localhost', '[::1]'].includes(host)
    ? 'local-daemon'
    : `${endpoint.protocol}//${endpoint.host}${endpoint.pathname}`
  // Why: the daemon runtime id and loopback port change on every restart, while
  // the last workspace snapshot must survive that restart to make cold open useful.
  return `v2:${bootstrap.protocolVersion}:${target}`
}

export function runtimeReconnectDelay(attempt: number, random: number): number {
  const exponentialMs = Math.min(30_000, 500 * 2 ** Math.min(attempt, 6))
  return exponentialMs + Math.floor(random * Math.min(1_000, exponentialMs / 4))
}

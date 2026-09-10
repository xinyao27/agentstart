import type { WorkspacePort } from '@agentstart/protocol'

// Why: the scanner reports numeric addresses (127.0.0.1, 0.0.0.0, ::1, ::)
// while UI actions should use an address a browser can reliably open.
function hostForLocalAction(host: string): string {
  if (!host) {
    return 'localhost'
  }
  return host.includes(':') ? `[${host}]` : host
}

export function addressForPort(port: WorkspacePort): string {
  // Why: when a dev server printed its own URL to the terminal, that origin
  // (e.g. `local.getmontecarlo.com:3001`) is what the user actually wants in
  // the clipboard, not the kernel bind `127.0.0.1:3001`.
  if (port.kind === 'workspace' && port.advertisedUrl) {
    try {
      const url = new URL(port.advertisedUrl)
      return url.host || `${hostForLocalAction(port.connectHost)}:${port.port}`
    } catch {
      // Fall through to OS-derived address.
    }
  }
  return `${hostForLocalAction(port.connectHost)}:${port.port}`
}

export function browserUrlForPort(port: WorkspacePort): string {
  if (port.kind === 'workspace' && port.advertisedUrl) {
    return port.advertisedUrl
  }
  const protocol = port.protocol === 'https' ? 'https' : 'http'
  return `${protocol}://${hostForLocalAction(port.connectHost)}:${port.port}`
}

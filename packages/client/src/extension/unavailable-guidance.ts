export type ExtensionUnavailableReason =
  | 'daemon-stopped'
  | 'incompatible-version'
  | 'loopback-check-failed'
  | 'missing-cli'
  | 'unknown'

export type ExtensionUnavailableGuidance = {
  fallback: string
  translationKey: string
}

export function extensionUnavailableGuidance(
  reason: ExtensionUnavailableReason
): ExtensionUnavailableGuidance {
  switch (reason) {
    case 'missing-cli':
      return {
        fallback:
          'The AgentStart CLI or Native Messaging host is missing. Run the install command below; AgentStart will reconnect when installation finishes.',
        translationKey: 'extension.unavailable.missingCli'
      }
    case 'daemon-stopped':
      return {
        fallback:
          'The local daemon stopped or could not start. Run “agentstart daemon” in a terminal, then retry here.',
        translationKey: 'extension.unavailable.daemonStopped'
      }
    case 'incompatible-version':
      return {
        fallback:
          'The extension and daemon use incompatible protocol versions. Update the older component, then retry.',
        translationKey: 'extension.unavailable.incompatible'
      }
    case 'loopback-check-failed':
      return {
        fallback:
          'AgentStart could not check the local daemon. Make sure it is running, then check the local connection permission or firewall settings below.',
        translationKey: 'extension.unavailable.loopbackCheckFailed'
      }
    case 'unknown':
      return {
        fallback:
          'AgentStart could not finish connecting. Open connection settings or the diagnostic details below, then retry.',
        translationKey: 'extension.unavailable.description'
      }
  }
}

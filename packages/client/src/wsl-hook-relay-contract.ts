/** connectionId stamped on WSL-relayed hook envelopes. Transport provenance
 *  only: the pane is a LOCAL pane on a local repo, so ownership checks must
 *  treat these ids as local (null), not as a remote connection. */
const WSL_HOOK_RELAY_CONNECTION_PREFIX = 'wsl:'

export function isWslHookRelayConnectionId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(WSL_HOOK_RELAY_CONNECTION_PREFIX)
}

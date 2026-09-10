# Mobile access across networks

AgentStart does not operate a relay or account service. AgentStart Mobile connects directly to the Rust daemon,
and its application payload remains end-to-end encrypted. When the phone and daemon are not on the
same LAN, provide network reachability with a private overlay such as Tailscale or WireGuard.

## Tailscale

1. Install Tailscale on the daemon host and iPhone, then join both to the same tailnet.
2. Start AgentStart and advertise the host's private address in the pairing offer:

   ```sh
   agentstart daemon --mobile-pairing --pairing-address 100.64.0.10
   ```

3. Open the emitted `agentstart://pair` link on the iPhone. For an already-running daemon, use:

   ```sh
   agentstart mobile pair --address 100.64.0.10 --device-name "My iPhone"
   ```

4. Limit inbound access to the daemon port with tailnet ACLs. Do not expose it through public port
   forwarding. The E2EE pairing token authenticates the mobile transport; network membership alone
   is not authentication.

Use the actual Tailscale address or MagicDNS name visible to the phone. Re-pair after intentionally
rotating the daemon's mobile key or deleting the paired device.

Do not add `--listen 0.0.0.0`: that option exposes the Chrome extension RPC listener and is not
needed for mobile access. The mobile listener binds independently and requires its E2EE device
credential.

## WireGuard

Put the daemon host and iPhone in the same WireGuard network, allow only the AgentStart mobile port between
their private addresses, then use the daemon host's WireGuard address in the same commands above.
Keep peer keys and configuration outside the repository. If the overlay changes the host address,
issue a new pairing link so the offer contains the reachable address.

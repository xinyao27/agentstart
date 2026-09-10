# Enterprise deployment

AgentStart's Chrome extension ID is `mfgmfiabfncmdekmikepemddejoeihbf`. Administrators can force-install
the Web Store build with Chrome's `ExtensionInstallForcelist` policy and configure the extension
through its [managed-storage schema](../../apps/extension/public/managed-storage-schema.json).
Verify applied values at `chrome://policy`; AgentStart never treats policy configuration as
authentication.

## Force installation

Set this `ExtensionInstallForcelist` entry after the Web Store listing has its final update URL:

```text
mfgmfiabfncmdekmikepemddejoeihbf;https://clients2.google.com/service/update2/crx
```

Chrome documents the platform policy locations. In short:

- macOS: deploy a configuration profile for the `com.google.Chrome` preference domain.
- Windows: configure `HKLM\Software\Policies\Google\Chrome\ExtensionInstallForcelist` through Group
  Policy or device management.
- Linux: deploy a managed-policy JSON file under Chrome's managed policy directory.

For unpacked internal deployments, use the organization's own update manifest and retain the same
extension key. Changing the key changes the extension ID and therefore the native-host allowlist.

## Managed AgentStart policies

The values below live under the extension's policy namespace. Chrome validates them against
`managed-storage-schema.json`, and the extension treats them as higher priority than user settings.

| Policy | Type | Effect |
| --- | --- | --- |
| `DaemonEndpoint` | string | Forces an exact `ws://` or `wss://` daemon endpoint. |
| `ProtocolVersion` | integer | Forces the expected runtime protocol version. |
| `AllowedSiteOrigins` | string array | Limits persistent page-context grants to exact HTTP(S) origins. |
| `DisableBrowserContext` | boolean | Disables all active-tab page capture. |
| `DisableOnDeviceAi` | boolean | Disables optional Chrome on-device AI enhancements. |
| `DisableCommunityAdapters` | boolean | Disables installation and restoration of user-script adapters. |

`DaemonEndpoint` deliberately has no companion token policy. Access tokens are secrets and remain in
Chrome's device-local extension storage; provision them on each managed device or rely on the local
Native Messaging bootstrap. Site policies constrain AgentStart's trust model but do not grant host access:
Chrome host permissions must still be granted through the browser's extension policy controls.

## Example policy payload

```json
{
  "DaemonEndpoint": "wss://agentstart.internal.example/rpc",
  "ProtocolVersion": 1,
  "AllowedSiteOrigins": ["https://jira.internal.example"],
  "DisableBrowserContext": false,
  "DisableOnDeviceAi": true,
  "DisableCommunityAdapters": true
}
```

After deployment, confirm all three layers before rollout: the extension is force-installed,
`chrome://policy` shows each value without an error, and AgentStart's settings page reflects the managed
behavior. A policy reaching Chrome does not prove that the daemon endpoint is reachable or that its
certificate and token are valid.

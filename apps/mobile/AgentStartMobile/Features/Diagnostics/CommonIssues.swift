import Foundation

nonisolated struct TroubleshootingIssue: Identifiable, Sendable {
    let id: String
    let glyph: AgentStartIconID
    let title: LocalizedStringResource
    let steps: [LocalizedStringResource]
}

nonisolated let troubleshootingIssues = [
    TroubleshootingIssue(
        id: "wifi",
        glyph: .wifiSlash,
        title: "Different WiFi Networks",
        steps: [
            "Both devices must be on the same local network (unless connected through Tailscale).",
            "Ethernet and WiFi must share the same subnet.",
            "Try reconnecting WiFi on both devices.",
        ]
    ),
    TroubleshootingIssue(
        id: "firewall",
        glyph: .shield,
        title: "Firewall Blocking Port 6768",
        steps: [
            "macOS: System Settings → Network → Firewall — allow AgentStart.",
            "Windows: Defender Firewall → Allow app — enable AgentStart for Private networks.",
            "Linux: sudo ufw allow 6768",
            "Corporate or school networks may block peer-to-peer traffic — try a personal hotspot.",
        ]
    ),
    TroubleshootingIssue(
        id: "daemon",
        glyph: .monitor,
        title: "AgentStart Daemon Not Running",
        steps: [
            "The AgentStart daemon must be running on the paired host to accept connections.",
            "Run `agentstart service install` or start `agentstart daemon` in a terminal.",
            "After an update, you may need to re-pair via QR code.",
        ]
    ),
    TroubleshootingIssue(
        id: "timeout",
        glyph: .clock,
        title: "Connection Timeout",
        steps: [
            "Check WiFi signal strength on your phone.",
            "Go back to the host list and tap your host to retry.",
            "Restart both apps if timeouts persist.",
        ]
    ),
    TroubleshootingIssue(
        id: "tailscale",
        glyph: .globe,
        title: "Tailscale Host Unreachable",
        steps: [
            "Host addresses like 100.x.x.x or *.ts.net connect through Tailscale — keep it on.",
            "iOS can silently wedge the tunnel: toggle Tailscale off and back on in its app.",
            "Check the daemon host is awake and shows as connected in your tailnet.",
            "Update the Tailscale app — recent releases fix reconnect bugs.",
        ]
    ),
    TroubleshootingIssue(
        id: "vpn",
        glyph: .shield,
        title: "Other VPN Interference",
        steps: [
            "Non-Tailscale VPNs can route local traffic through a remote server.",
            "Disable that VPN or enable split tunneling or Allow LAN.",
        ]
    ),
]

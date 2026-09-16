import SwiftUI

/// Home's iPad sidebar: the paired hosts, plus the overview entry for the dashboard.
struct HostsSidebar: View {
    let hosts: [HostProfile]
    let connections: [String: RuntimeConnectionSnapshot]
    let selectedHostID: String?
    let selectHome: () -> Void
    let selectHost: (HostProfile) -> Void
    let showPairing: () -> Void

    var body: some View {
        List {
            sidebarRow(
                title: Text("Home"),
                iconID: .home,
                isSelected: selectedHostID == nil,
                action: selectHome
            )

            Section("Hosts") {
                if hosts.isEmpty {
                    emptyState
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else {
                    ForEach(hosts, id: \.id) { host in
                        Button {
                            selectHost(host)
                        } label: {
                            HostSidebarRow(host: host, snapshot: connections[host.id])
                        }
                        .buttonStyle(.appPlain)
                        .listRowBackground(
                            selectionBackground(isSelected: host.id == selectedHostID))
                    }
                }
            }
        }
        .navigationTitle("Hosts")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: showPairing) {
                    AgentStartToolbarIcon(.add)
                }
                .accessibilityLabel("Pair daemon")
            }
        }
    }

    private func sidebarRow(
        title: Text,
        iconID: AgentStartIconID,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label {
                title
            } icon: {
                AgentStartIcon(iconID, size: Theme.Control.tabIcon)
            }
            .frame(minHeight: Theme.Size.minimumHitTarget)
        }
        .buttonStyle(.appPlain)
        .listRowBackground(selectionBackground(isSelected: isSelected))
    }

    private func selectionBackground(isSelected: Bool) -> some View {
        RoundedRectangle(cornerRadius: Theme.Radius.control)
            .fill(isSelected ? Theme.Colors.selection : Color.clear)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            Text("No hosts paired")
                .font(Theme.Typography.primary)
            Text("Pair a daemon to see its workspaces here.")
                .font(Theme.Typography.supporting)
                .foregroundStyle(Theme.Colors.mutedForeground)
            Button("Pair daemon", iconID: .monitor, action: showPairing)
                .appProminentGlassButton()
                .appButtonContext(.regular)
                .padding(.top, Theme.Spacing.extraSmall)
        }
        .padding(.vertical, Theme.Spacing.small)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct HostSidebarRow: View {
    let host: HostProfile
    let snapshot: RuntimeConnectionSnapshot?

    var body: some View {
        HStack(spacing: Theme.Spacing.medium) {
            statusIndicator
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(host.name)
                    .font(Theme.Typography.primary)
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                Text(statusLabel)
                    .font(Theme.Typography.metadata)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(1)
            }
        }
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var statusIndicator: some View {
        switch snapshot?.phase {
        case .connecting, .reconnecting:
            AgentStartLoader(size: Theme.Control.inlineIcon)
        case .unreachable, .authenticationFailed:
            AgentStartIcon(.warning, size: Theme.Control.inlineIcon)
                .foregroundStyle(Theme.Colors.attention)
        case .connected:
            Circle()
                .fill(Theme.Colors.success)
                .frame(
                    width: Theme.Control.statusIndicator,
                    height: Theme.Control.statusIndicator
                )
                .frame(width: Theme.Control.inlineIcon, height: Theme.Control.inlineIcon)
        case .idle, nil:
            Circle()
                .fill(Theme.Colors.statusNeutral)
                .frame(
                    width: Theme.Control.statusIndicator,
                    height: Theme.Control.statusIndicator
                )
                .frame(width: Theme.Control.inlineIcon, height: Theme.Control.inlineIcon)
        }
    }

    private var statusLabel: LocalizedStringResource {
        switch snapshot?.phase {
        case .connecting: "Connecting"
        case .reconnecting: "Reconnecting"
        case .unreachable: "Unreachable"
        case .authenticationFailed: "Authentication failed"
        case .connected: "Connected"
        case .idle, nil: "Not connected"
        }
    }
}

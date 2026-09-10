import SwiftUI

struct HomeAccountUsageSection: View {
    let snapshots: [HomeHostWorkspaceSnapshot]
    let now: Date
    let openAccounts: (HostProfile) -> Void
    let editHost: (HostProfile) -> Void
    let reconnect: (HostProfile) -> Void
    let disconnect: (HostProfile) -> Void
    let requestRemove: (HostProfile) -> Void

    var body: some View {
        if !usageHosts.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Text("Usage")
                    .font(.system(size: Theme.Typography.emphasis, weight: .semibold))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                ContentSurface {
                    VStack(spacing: 0) {
                        ForEach(Array(usageHosts.enumerated()), id: \.element.host.id) {
                            index, item in
                            if index > 0 { Divider() }
                            hostUsage(item)
                        }
                    }
                }
            }
        }
    }

    private func hostUsage(_ item: UsageHost) -> some View {
        Button {
            openAccounts(item.host)
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                if usageHosts.count > 1 {
                    Text(verbatim: item.host.name.uppercased())
                        .font(.system(size: Theme.Typography.metadata, weight: .semibold))
                        .tracking(0.4)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(1)
                }
                ForEach(item.sections) { section in
                    providerRow(section)
                }
            }
            .padding(.vertical, HomeDashboardMetrics.hostVerticalPadding)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
        .contextMenu {
            Button {
                reconnect(item.host)
            } label: {
                Label(connectActionTitle(for: item.connection), iconID: .refresh)
            }
            if isLive(item.connection?.phase) {
                Button("Disconnect", iconID: .stop) { disconnect(item.host) }
            }
            Button("Edit host", iconID: .edit) { editHost(item.host) }
            Button("Remove", iconID: .trash, role: .destructive) {
                requestRemove(item.host)
            }
        }
    }

    private func providerRow(_ section: AccountProviderSection) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.small) {
            AccountProviderMark(provider: section.provider)
                .frame(width: Theme.Spacing.large, height: Theme.Spacing.large)
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                HStack(spacing: Theme.Spacing.small) {
                    Text(section.provider.title)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    if let plan = section.usage?.plan {
                        Text(verbatim: "· \(plan)")
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                            // Why: the plan takes the flexible slot. With no plan, the reset
                            // label sits directly after the provider name instead of being
                            // pushed out to the trailing edge and reading as unrelated.
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if let reset = nearestReset(section) {
                        Text(accountResetLabel(until: reset, now: now))
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                    }
                }
                // Why: React Native's row is full-width even when a provider has no plan. A
                // SwiftUI HStack otherwise collapses to its intrinsic width, putting the reset
                // countdown immediately after the provider name instead of at the trailing edge.
                .frame(maxWidth: .infinity, alignment: .leading)
                if let usage = section.usage, !usage.windows.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                        ForEach(Array(usageWindowRows(usage.windows).enumerated()), id: \.offset) {
                            _, row in
                            HStack(alignment: .top, spacing: Theme.Spacing.medium) {
                                ForEach(row) { window in
                                    usageBar(window)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                } else {
                    Text(usageStatus(section.usage))
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var usageHosts: [UsageHost] {
        snapshots.compactMap { snapshot in
            guard snapshot.connection?.phase == .connected, let accounts = snapshot.accounts else {
                return nil
            }
            let sections = accounts.sections.filter { section in
                guard let usage = section.usage else { return false }
                return !usage.windows.isEmpty || usage.status != .idle
            }
            guard !sections.isEmpty else { return nil }
            return UsageHost(
                host: snapshot.host,
                connection: snapshot.connection,
                sections: sections
            )
        }
    }

    // Why: the bar is always flexible, however many windows share the row, so a lone window
    // stretches to the row's full width exactly like one sharing it. There is no
    // fixed-width case.
    private func usageBar(_ window: AccountUsageWindow) -> some View {
        AccountUsageBar(window: window, now: now, density: .compact)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func nearestReset(_ section: AccountProviderSection) -> Date? {
        section.usage?.windows.compactMap(\.resetsAt).min()
    }

    private func usageWindowRows(_ windows: [AccountUsageWindow]) -> [[AccountUsageWindow]] {
        var rows: [[AccountUsageWindow]] = []
        var index = 0
        while index < windows.count {
            let remaining = windows.count - index
            let rowCount = remaining == 1 ? 1 : 2
            rows.append(Array(windows[index..<(index + rowCount)]))
            index += rowCount
        }
        return rows
    }

    private func usageStatus(_ usage: AccountProviderUsage?) -> LocalizedStringResource {
        guard let usage else { return "No usage data" }
        return switch usage.status {
        case .idle, .fetching: "Loading usage…"
        case .ok: "No usage data"
        case .error: "Unable to refresh usage"
        case .unavailable: "Usage unavailable"
        }
    }

    private func isLive(_ phase: RuntimeConnectionPhase?) -> Bool {
        switch phase {
        case .connecting, .connected, .reconnecting: true
        case nil, .idle, .unreachable, .authenticationFailed: false
        }
    }

    private func connectActionTitle(for connection: RuntimeConnectionSnapshot?) -> String {
        connection?.lastConnectedAt != nil && isLive(connection?.phase)
            ? "Reconnect" : "Connect"
    }
}

nonisolated private struct UsageHost: Sendable {
    let host: HostProfile
    let connection: RuntimeConnectionSnapshot?
    let sections: [AccountProviderSection]
}

import SwiftUI

struct AccountUsageSection: View {
    let section: AccountProviderSection
    let now: Date
    let busyAccountID: String?
    let isConnected: Bool
    let selectAccount: (String?) -> Void

    var body: some View {
        ContentSurface {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: Theme.Spacing.standard) {
                    providerHeader
                    usageContent
                    if let error = section.usage?.error, !error.isEmpty {
                        Text(verbatim: error)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.attention)
                            .lineLimit(2)
                    }
                }

                if section.provider.supportsSelection, !section.accounts.isEmpty {
                    Divider()
                        .padding(.top, Theme.Spacing.medium)
                    Text("Managed accounts")
                        .font(
                            .system(
                                size: Theme.Typography.metadata,
                                weight: .semibold
                            )
                        )
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, Theme.Spacing.medium)
                        .padding(.bottom, Theme.Spacing.extraSmall)

                    ForEach(Array(section.accounts.enumerated()), id: \.element.id) {
                        index, account in
                        if index > 0 { Divider() }
                        accountRow(account)
                    }
                }
            }
        }
    }

    private var providerHeader: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.small) {
            AccountProviderMark(provider: section.provider)
                .frame(width: Theme.Spacing.extraLarge, height: Theme.Spacing.extraLarge)

            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                HStack(spacing: Theme.Spacing.extraSmall) {
                    Text(section.provider.title)
                        .font(
                            .system(
                                size: Theme.Typography.primary,
                                weight: .semibold
                            )
                        )
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    if let plan = section.usage?.plan {
                        Text(verbatim: "· \(plan)")
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                    }
                }
                Text(updatedLabel)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                HStack(spacing: Theme.Spacing.small) {
                    Text(accountModeLabel)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if section.activeAccountID != nil, section.provider.supportsSelection {
                        Button {
                            selectAccount(nil)
                        } label: {
                            if busyAccountID == "\(section.provider.rawValue):default" {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Text("Use default")
                                    .font(.system(size: Theme.Typography.metadata))
                                    .foregroundStyle(Theme.Colors.foreground)
                            }
                        }
                        .buttonStyle(.appPlain)
                        .frame(
                            minWidth: Theme.Size.minimumHitTarget,
                            minHeight: Theme.Size.minimumHitTarget
                        )
                        .contentShape(.interaction, .rect)
                        .disabled(busyAccountID != nil || !isConnected)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var usageContent: some View {
        if let usage = section.usage, !usage.windows.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.standard) {
                ForEach(usage.windows) { window in
                    AccountUsageBar(window: window, now: now)
                }
            }
        } else {
            Text(usageStatusLabel(section.usage))
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
    }

    private func accountRow(_ account: ManagedAccount) -> some View {
        let isActive = section.activeAccountID == account.id
        let inactiveUsage = section.inactiveUsage.first { $0.accountID == account.id }
        return Button {
            selectAccount(account.id)
        } label: {
            HStack(spacing: Theme.Spacing.small) {
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text(verbatim: account.email)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    if let subtitle = account.subtitle?.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ), !subtitle.isEmpty {
                        Text(verbatim: subtitle)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                    }
                    inactiveUsageContent(inactiveUsage)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Group {
                    if isActive {
                        AgentStartIcon(.check, size: 16)
                    } else if busyAccountID == account.id {
                        ProgressView()
                            .controlSize(.small)
                    }
                }
                .frame(width: 24, alignment: .trailing)
            }
            .padding(.vertical, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
        .disabled(isActive || busyAccountID != nil || !isConnected)
    }

    @ViewBuilder
    private func inactiveUsageContent(_ inactiveUsage: InactiveAccountUsage?) -> some View {
        if let usage = inactiveUsage?.usage, !usage.windows.isEmpty {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 116), spacing: 12)],
                alignment: .leading,
                spacing: Theme.Spacing.extraSmall
            ) {
                ForEach(usage.windows) { window in
                    AccountUsageBar(window: window, now: now, density: .compact)
                }
            }
            .padding(.top, Theme.Spacing.extraSmall)
        } else if inactiveUsage?.isFetching == true {
            HStack(spacing: Theme.Spacing.small) {
                ProgressView()
                    .controlSize(.mini)
                Text("Loading usage…")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
        } else if let usage = inactiveUsage?.usage {
            Text(usageStatusLabel(usage))
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(1)
        }
        if let error = inactiveUsage?.usage?.error, !error.isEmpty {
            Text(verbatim: error)
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.attention)
                .lineLimit(1)
        }
    }

    private var updatedLabel: LocalizedStringResource {
        guard let updatedAt = section.usage?.updatedAt else { return "Not updated yet" }
        let elapsedMinutes = max(0, Int(now.timeIntervalSince(updatedAt) / 60))
        if elapsedMinutes < 1 { return "Updated just now" }
        if elapsedMinutes < 60 { return "Updated \(elapsedMinutes)m ago" }
        return "Updated \(elapsedMinutes / 60)h ago"
    }

    private var accountModeLabel: LocalizedStringResource {
        if section.activeAccountID != nil { return "Using managed account" }
        if section.provider.supportsSelection { return "Using system default" }
        return "Using daemon-host credentials"
    }

    private func usageStatusLabel(_ usage: AccountProviderUsage?) -> LocalizedStringResource {
        guard let usage else { return "No usage data" }
        return switch usage.status {
        case .idle, .fetching: "Loading usage…"
        case .ok: "No usage data"
        case .error: "Unable to refresh usage"
        case .unavailable: "Usage unavailable"
        }
    }
}

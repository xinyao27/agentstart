import Foundation
import YiruProtocol

extension RuntimeClient: AccountsRepository {
    func accounts(for hostID: String) async throws -> AccountsSnapshot {
        try mapAccountsSnapshot(try await protocolAccounts(hostID: hostID))
    }

    func accountUpdates(for hostID: String) async throws
        -> AsyncThrowingStream<AccountsSnapshot, Error>
    {
        let source = try await protocolAccountUpdates(hostID: hostID)
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: AccountsSnapshot.self)
        let forwardingTask = Task {
            do {
                for try await snapshot in source {
                    continuation.yield(try mapAccountsSnapshot(snapshot))
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return stream
    }

    func selectAccount(
        hostID: String,
        provider: AccountProvider,
        accountID: String?
    ) async throws {
        if accountID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true {
            throw RuntimeResponseValidationError("account_id")
        }
        let protocolProvider: Yiru_Runtime_V1_AccountProvider
        switch provider {
        case .claude: protocolProvider = .claude
        case .codex: protocolProvider = .codex
        default: throw AccountsRepositoryError.unsupportedProvider
        }
        let response = try await protocolSelectAccount(
            hostID: hostID,
            provider: protocolProvider,
            accountID: accountID
        )
        guard response.hasRoster else {
            throw RuntimeResponseValidationError("select.roster")
        }
        _ = try mapAccountRoster(response.roster, provider: provider)
    }
}

nonisolated private struct MappedAccountRoster {
    let accounts: [ManagedAccount]
    let activeAccountID: String?
}

nonisolated private func mapAccountsSnapshot(
    _ snapshot: Yiru_Runtime_V1_AccountsSnapshot
) throws -> AccountsSnapshot {
    guard snapshot.hasClaude, snapshot.hasCodex, snapshot.hasRateLimits else {
        throw RuntimeResponseValidationError("accounts_snapshot")
    }
    let claude = try mapAccountRoster(snapshot.claude, provider: .claude)
    let codex = try mapAccountRoster(snapshot.codex, provider: .codex)
    let rates = snapshot.rateLimits
    let usage: [AccountProvider: AccountProviderUsage] = try Dictionary(
        uniqueKeysWithValues: AccountProvider.allCases.compactMap { provider in
            guard let limits = protocolUsage(rates, provider: provider) else { return nil }
            guard let usage = try mapProviderUsage(limits, expectedProvider: provider) else {
                return nil
            }
            return (provider, usage)
        }
    )
    let inactiveClaude = try rates.inactiveClaudeAccounts.map {
        try mapInactiveUsage($0, expectedProvider: .claude)
    }
    let inactiveCodex = try rates.inactiveCodexAccounts.map {
        try mapInactiveUsage($0, expectedProvider: .codex)
    }
    guard Set(inactiveClaude.map(\.accountID)).count == inactiveClaude.count,
        Set(inactiveCodex.map(\.accountID)).count == inactiveCodex.count
    else {
        throw RuntimeResponseValidationError("inactive_account_usage.account_id")
    }

    return AccountsSnapshot(
        sections: AccountProvider.allCases.compactMap { provider in
            let roster: MappedAccountRoster?
            let inactive: [InactiveAccountUsage]
            switch provider {
            case .claude:
                roster = claude
                inactive = inactiveClaude
            case .codex:
                roster = codex
                inactive = inactiveCodex
            default:
                roster = nil
                inactive = []
            }
            guard roster?.accounts.isEmpty == false || usage[provider]?.isRenderable == true else {
                return nil
            }
            return AccountProviderSection(
                provider: provider,
                accounts: roster?.accounts ?? [],
                activeAccountID: roster?.activeAccountID,
                usage: usage[provider],
                inactiveUsage: inactive
            )
        }
    )
}

nonisolated private func mapAccountRoster(
    _ roster: Yiru_Runtime_V1_AccountRoster,
    provider: AccountProvider
) throws -> MappedAccountRoster {
    let accounts = try roster.accounts.map { account in
        guard !account.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !account.email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            throw RuntimeResponseValidationError("account")
        }
        switch provider {
        case .claude:
            guard !account.hasWorkspaceLabel else {
                throw RuntimeResponseValidationError("account.workspace_label")
            }
        case .codex:
            guard !account.hasOrganizationName else {
                throw RuntimeResponseValidationError("account.organization_name")
            }
        default:
            throw RuntimeResponseValidationError("account.provider")
        }
        let organizationName = account.hasOrganizationName ? account.organizationName : nil
        let workspaceLabel = account.hasWorkspaceLabel ? account.workspaceLabel : nil
        return ManagedAccount(
            id: account.id,
            email: account.email,
            subtitle: organizationName ?? workspaceLabel,
            organizationName: organizationName,
            workspaceLabel: workspaceLabel
        )
    }
    let activeAccountID = roster.hasActiveAccountID ? roster.activeAccountID : nil
    guard Set(accounts.map(\.id)).count == accounts.count else {
        throw RuntimeResponseValidationError("account.id")
    }
    if let activeAccountID {
        guard !activeAccountID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            accounts.contains(where: { $0.id == activeAccountID })
        else {
            throw RuntimeResponseValidationError("account_roster.active_account_id")
        }
    }
    return MappedAccountRoster(accounts: accounts, activeAccountID: activeAccountID)
}

nonisolated private func protocolUsage(
    _ state: Yiru_Runtime_V1_AccountRateLimitState,
    provider: AccountProvider
) -> Yiru_Runtime_V1_ProviderRateLimits? {
    switch provider {
    case .claude: state.hasClaude ? state.claude : nil
    case .codex: state.hasCodex ? state.codex : nil
    case .cursor: state.hasCursor ? state.cursor : nil
    case .gemini: state.hasGemini ? state.gemini : nil
    case .opencodeGo: state.hasOpenCodeGo ? state.openCodeGo : nil
    case .kimi: state.hasKimi ? state.kimi : nil
    case .antigravity: state.hasAntigravity ? state.antigravity : nil
    case .minimax: state.hasMinimax ? state.minimax : nil
    case .grok: state.hasGrok ? state.grok : nil
    }
}

nonisolated private func mapProviderUsage(
    _ limits: Yiru_Runtime_V1_ProviderRateLimits,
    expectedProvider: AccountProvider
) throws -> AccountProviderUsage? {
    guard let provider = try accountProvider(limits.provider) else { return nil }
    guard provider == expectedProvider,
        limits.updatedAtMs.isFinite,
        limits.updatedAtMs >= 0
    else {
        throw RuntimeResponseValidationError("provider_rate_limits")
    }
    var windows: [AccountUsageWindow] = []
    if !limits.buckets.isEmpty {
        windows = try limits.buckets.enumerated().map { index, bucket in
            guard bucket.hasWindow,
                !bucket.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else {
                throw RuntimeResponseValidationError("provider_rate_limits.buckets")
            }
            return try mapWindow(
                bucket.window,
                id: "bucket-\(index)-\(bucket.name)",
                label: bucket.name,
                compactLabel: bucket.name
            )
        }
        if limits.hasWeekly {
            windows.append(
                try mapWindow(limits.weekly, id: "weekly", label: "Weekly", compactLabel: "wk")
            )
        }
    } else {
        let candidates:
            [(
                Bool, Yiru_Runtime_V1_RateLimitWindow, String, String, String
            )] = [
                (limits.hasSession, limits.session, "session", "Session", "5h"),
                (limits.hasWeekly, limits.weekly, "weekly", "Weekly", "wk"),
                (limits.hasFableWeekly, limits.fableWeekly, "fable", "Fable", "Fable"),
                (limits.hasMonthly, limits.monthly, "monthly", "Monthly", "mo"),
            ]
        windows = try candidates.compactMap { isPresent, window, id, label, compactLabel in
            guard isPresent else { return nil }
            return try mapWindow(
                window,
                id: id,
                label: label,
                compactLabel: compactLabel
            )
        }
    }
    return AccountProviderUsage(
        windows: windows,
        plan: planLabel(limits.hasPlanType ? limits.planType : nil),
        updatedAt: limits.updatedAtMs > 0 ? date(milliseconds: limits.updatedAtMs) : nil,
        error: limits.hasError ? limits.error : nil,
        status: try usageStatus(limits.status)
    )
}

nonisolated private func mapWindow(
    _ window: Yiru_Runtime_V1_RateLimitWindow,
    id: String,
    label: String,
    compactLabel: String
) throws -> AccountUsageWindow {
    guard window.usedPercent.isFinite,
        (0...100).contains(window.usedPercent),
        window.windowMinutes.isFinite,
        window.windowMinutes > 0,
        !window.hasResetsAtMs || window.resetsAtMs.isFinite && window.resetsAtMs >= 0
    else {
        throw RuntimeResponseValidationError("rate_limit_window")
    }
    return AccountUsageWindow(
        id: id,
        label: label,
        compactLabel: compactLabel,
        usedPercent: window.usedPercent,
        resetsAt: window.hasResetsAtMs ? date(milliseconds: window.resetsAtMs) : nil,
        windowMinutes: window.windowMinutes,
        resetDescription: window.hasResetDescription ? window.resetDescription : nil
    )
}

nonisolated private func mapInactiveUsage(
    _ inactive: Yiru_Runtime_V1_InactiveAccountUsage,
    expectedProvider: AccountProvider
) throws -> InactiveAccountUsage {
    guard !inactive.accountID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        inactive.updatedAtMs.isFinite,
        inactive.updatedAtMs >= 0
    else {
        throw RuntimeResponseValidationError("inactive_account_usage")
    }
    return InactiveAccountUsage(
        accountID: inactive.accountID,
        usage: inactive.hasRateLimits
            ? try mapProviderUsage(inactive.rateLimits, expectedProvider: expectedProvider)
            : nil,
        isFetching: inactive.isFetching,
        updatedAt: inactive.updatedAtMs > 0 ? date(milliseconds: inactive.updatedAtMs) : nil
    )
}

nonisolated private func accountProvider(
    _ provider: Yiru_Runtime_V1_AccountProvider
) throws -> AccountProvider? {
    switch provider {
    case .claude: .claude
    case .codex: .codex
    case .cursor: .cursor
    case .gemini: .gemini
    case .openCodeGo: .opencodeGo
    case .kimi: .kimi
    case .antigravity: .antigravity
    case .minimax: .minimax
    case .grok: .grok
    case .UNRECOGNIZED: nil
    case .unspecified: throw RuntimeResponseValidationError("provider")
    }
}

nonisolated private func usageStatus(
    _ status: Yiru_Runtime_V1_AccountUsageStatus
) throws -> AccountUsageStatus {
    switch status {
    case .idle: .idle
    case .fetching: .fetching
    case .ok: .ok
    case .error: .error
    case .unavailable: .unavailable
    case .UNRECOGNIZED: .unavailable
    case .unspecified: throw RuntimeResponseValidationError("usage_status")
    }
}

nonisolated private func date(milliseconds: Double) -> Date {
    Date(timeIntervalSince1970: milliseconds / 1_000)
}

nonisolated private func planLabel(_ value: String?) -> String? {
    let words = value?.split(whereSeparator: { $0 == " " || $0 == "_" || $0 == "-" }) ?? []
    guard !words.isEmpty else { return nil }
    return words.map { word in
        word.lowercased() == "chatgpt" ? "ChatGPT" : word.capitalized
    }.joined(separator: " ")
}

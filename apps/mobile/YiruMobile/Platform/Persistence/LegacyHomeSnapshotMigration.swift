import Foundation

@MainActor
enum LegacyHomeSnapshotMigration {
    private static let legacyKey = "yiru:home-snapshot:v1"
    private static let markerKey = "yiru.native-migration.expo-home-snapshot.v1"

    static func perform(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        guard !defaults.bool(forKey: markerKey),
            defaults.data(forKey: HomeSnapshotCache.storageKey) == nil,
            let raw = storage.value(forKey: legacyKey),
            let data = raw.data(using: .utf8),
            let legacy = try? JSONDecoder().decode(LegacyHomeSnapshot.self, from: data),
            let snapshot = CachedHomeSnapshot(legacy: legacy)
        else {
            return
        }

        guard let encoded = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(encoded, forKey: HomeSnapshotCache.storageKey)
        defaults.set(true, forKey: markerKey)
    }
}

private struct LegacyHomeSnapshot: Decodable {
    let worktreeInfo: [String: LegacyHostWorktreeInfo]
    let accountsByHost: [String: LegacyAccountsSnapshot]
    let statsByHost: [String: LegacyRuntimeStatsSummary]?
    let savedAt: Double
}

private struct LegacyHostWorktreeInfo: Decodable {
    let hostId: String?
    let activeWorktrees: [LegacyWorktreeSummary]?
    let lastActiveWorktree: LegacyWorktreeSummary?
}

private struct LegacyWorktreeSummary: Decodable {
    let worktreeId: String
    let repo: String
    let branch: String
    let displayName: String
    let liveTerminalCount: Int
    let status: String?
}

private struct LegacyAccountsSnapshot: Decodable {
    let claude: LegacyAccountGroup
    let codex: LegacyAccountGroup
    let rateLimits: LegacyRateLimits
}

private struct LegacyAccountGroup: Decodable {
    let accounts: [LegacyManagedAccount]
    let activeAccountId: String?
}

private struct LegacyManagedAccount: Decodable {
    let id: String
    let email: String
    let organizationName: String?
    let workspaceLabel: String?
}

private struct LegacyRateLimits: Decodable {
    let claude: LegacyProviderRateLimits?
    let codex: LegacyProviderRateLimits?
    let cursor: LegacyProviderRateLimits?
    let gemini: LegacyProviderRateLimits?
    let opencodeGo: LegacyProviderRateLimits?
    let kimi: LegacyProviderRateLimits?
    let antigravity: LegacyProviderRateLimits?
    let minimax: LegacyProviderRateLimits?
    let grok: LegacyProviderRateLimits?
}

private struct LegacyProviderRateLimits: Decodable {
    let session: LegacyRateLimitWindow?
    let weekly: LegacyRateLimitWindow?
    let fableWeekly: LegacyRateLimitWindow?
    let monthly: LegacyRateLimitWindow?
    let buckets: [LegacyNamedRateLimitWindow]?
    let planType: String?
    let updatedAt: Double?
    let error: String?
    let status: String?
    let inactiveClaudeAccounts: [LegacyInactiveAccountUsage]?
    let inactiveCodexAccounts: [LegacyInactiveAccountUsage]?
}

private struct LegacyNamedRateLimitWindow: Decodable {
    let name: String
    let usedPercent: Double?
    let resetsAt: Double?
}

private struct LegacyRateLimitWindow: Decodable {
    let usedPercent: Double?
    let resetsAt: Double?
}

private struct LegacyInactiveAccountUsage: Decodable {
    let accountId: String
    let rateLimits: LegacyProviderRateLimits?
    let isFetching: Bool
}

private struct LegacyRuntimeStatsSummary: Decodable {
    let totalAgentsSpawned: Double
    let totalPRsCreated: Double
    let totalAgentTimeMs: Double
    let firstEventAt: Double?
    let dailyActivity: [LegacyDailyActivity]?
    let dailyTokens: [LegacyDailyTokens]?
    let dailyValues: [LegacyDailyValue]?
    let modelUsage: [LegacyModelUsage]?
    let dailyProviderUsage: [LegacyDailyProviderUsage]?
    let projectUsage: [LegacyProjectUsage]?
    let usageRange: String?
    let usageValueAvailable: Bool?
    let hasUnpricedUsage: Bool?
}

private struct LegacyDailyActivity: Decodable {
    let day: String
    let agentStarts: Double
    let prsCreated: Double
}

private struct LegacyDailyTokens: Decodable {
    let day: String
    let tokens: Double
}

private struct LegacyDailyValue: Decodable {
    let day: String
    let valueUsd: Double
}

private struct LegacyModelUsage: Decodable {
    let key: String
    let label: String
    let tokens: Double
    let valueUsd: Double?
}

private struct LegacyProviderUsage: Decodable {
    let provider: String
    let tokens: Double
    let valueUsd: Double?
}

private struct LegacyDailyProviderUsage: Decodable {
    let day: String
    let providers: [LegacyProviderUsage]
}

private struct LegacyProjectUsage: Decodable {
    let key: String
    let label: String
    let sessions: Double
    let tokens: Double
    let valueUsd: Double?
    let providers: [LegacyProviderUsage]
}

private extension CachedHomeSnapshot {
    init?(legacy: LegacyHomeSnapshot) {
        guard legacy.savedAt.isFinite else { return nil }
        let savedAt = Date(timeIntervalSince1970: legacy.savedAt / 1_000)
        accounts = legacy.accountsByHost.compactMapValues(AccountsSnapshot.init(legacy:))
        activityStats =
            legacy.statsByHost?.compactMapValues(ActivityStatsSummary.init(legacy:)) ?? [:]
        workspaces = legacy.worktreeInfo.reduce(into: [:]) { output, entry in
            let info = entry.value
            let source =
                info.activeWorktrees?.isEmpty == false
                ? info.activeWorktrees ?? []
                : info.lastActiveWorktree.map { [$0] } ?? []
            let hostID = info.hostId ?? entry.key
            let values = source.map { item in
                WorkspaceSummary.legacyCached(
                    hostID: hostID,
                    worktreeID: item.worktreeId,
                    repo: item.repo,
                    branch: item.branch,
                    displayName: item.displayName,
                    liveTerminalCount: item.liveTerminalCount,
                    status: item.status,
                    savedAt: savedAt
                )
            }
            if !values.isEmpty { output[entry.key] = values }
        }
        self.savedAt = savedAt
    }
}

private extension AccountsSnapshot {
    init?(legacy: LegacyAccountsSnapshot) {
        let sections = AccountProvider.allCases.compactMap { provider -> AccountProviderSection? in
            let accounts: [ManagedAccount]
            let activeAccountID: String?
            let inactiveUsage: [InactiveAccountUsage]
            let providerLimits: LegacyProviderRateLimits?
            switch provider {
            case .claude:
                providerLimits = legacy.rateLimits.claude
                accounts = legacy.claude.accounts.map {
                    ManagedAccount(
                        id: $0.id,
                        email: $0.email,
                        subtitle: $0.organizationName
                    )
                }
                activeAccountID = legacy.claude.activeAccountId
                inactiveUsage =
                    providerLimits?.inactiveClaudeAccounts?.compactMap {
                        InactiveAccountUsage(legacy: $0)
                    } ?? []
            case .codex:
                providerLimits = legacy.rateLimits.codex
                accounts = legacy.codex.accounts.map {
                    ManagedAccount(
                        id: $0.id,
                        email: $0.email,
                        subtitle: $0.workspaceLabel
                    )
                }
                activeAccountID = legacy.codex.activeAccountId
                inactiveUsage =
                    providerLimits?.inactiveCodexAccounts?.compactMap {
                        InactiveAccountUsage(legacy: $0)
                    } ?? []
            default:
                providerLimits =
                    switch provider {
                    case .cursor: legacy.rateLimits.cursor
                    case .gemini: legacy.rateLimits.gemini
                    case .opencodeGo: legacy.rateLimits.opencodeGo
                    case .kimi: legacy.rateLimits.kimi
                    case .antigravity: legacy.rateLimits.antigravity
                    case .minimax: legacy.rateLimits.minimax
                    case .grok: legacy.rateLimits.grok
                    case .claude, .codex: nil
                    }
                accounts = []
                activeAccountID = nil
                inactiveUsage = []
            }
            let usage = AccountProviderUsage(legacy: providerLimits)
            guard !accounts.isEmpty || usage?.isRenderableForMigration == true else { return nil }
            return AccountProviderSection(
                provider: provider,
                accounts: accounts,
                activeAccountID: activeAccountID,
                usage: usage,
                inactiveUsage: inactiveUsage
            )
        }
        guard !sections.isEmpty else { return nil }
        self.init(sections: sections)
    }
}

private extension AccountProviderUsage {
    init?(legacy: LegacyProviderRateLimits?) {
        guard let legacy else { return nil }
        var windows =
            legacy.buckets?.compactMap { bucket in
                Self.window(
                    id: bucket.name,
                    label: bucket.name,
                    compactLabel: bucket.name,
                    usedPercent: bucket.usedPercent,
                    resetsAt: bucket.resetsAt
                )
            } ?? []
        if windows.isEmpty {
            let candidates: [(String, String, String, LegacyRateLimitWindow?)] = [
                ("session", "Session", "5h", legacy.session),
                ("weekly", "Weekly", "wk", legacy.weekly),
                ("fable", "Fable", "Fable", legacy.fableWeekly),
                ("monthly", "Monthly", "mo", legacy.monthly),
            ]
            windows = candidates.compactMap { id, label, compactLabel, window in
                Self.window(
                    id: id,
                    label: label,
                    compactLabel: compactLabel,
                    usedPercent: window?.usedPercent,
                    resetsAt: window?.resetsAt
                )
            }
        }
        self.init(
            windows: windows,
            plan: legacy.planType?.isEmpty == false ? legacy.planType : nil,
            updatedAt: legacy.updatedAt.flatMap(Self.date(milliseconds:)),
            error: legacy.error,
            status: AccountUsageStatus(rawValue: legacy.status ?? "")
                ?? (windows.isEmpty ? .unavailable : .ok)
        )
    }

    private static func window(
        id: String,
        label: String,
        compactLabel: String,
        usedPercent: Double?,
        resetsAt: Double?
    ) -> AccountUsageWindow? {
        guard let usedPercent, usedPercent.isFinite else { return nil }
        return AccountUsageWindow(
            id: id,
            label: label,
            compactLabel: compactLabel,
            usedPercent: usedPercent,
            resetsAt: resetsAt.flatMap(Self.date(milliseconds:))
        )
    }

    private static func date(milliseconds: Double) -> Date? {
        guard milliseconds.isFinite else { return nil }
        return Date(timeIntervalSince1970: milliseconds / 1_000)
    }

    var isRenderableForMigration: Bool {
        !windows.isEmpty || status != .idle && status != .unavailable
    }
}

private extension InactiveAccountUsage {
    init?(legacy: LegacyInactiveAccountUsage) {
        accountID = legacy.accountId
        usage = AccountProviderUsage(legacy: legacy.rateLimits)
        isFetching = legacy.isFetching
        updatedAt = nil
    }
}

private extension ActivityStatsSummary {
    init?(legacy: LegacyRuntimeStatsSummary) {
        guard legacy.totalAgentsSpawned.isFinite,
            legacy.totalPRsCreated.isFinite,
            legacy.totalAgentTimeMs.isFinite
        else { return nil }

        let activities = (legacy.dailyActivity ?? []).reduce(into: [String: (Double, Double)]()) {
            output,
            entry in
            guard !entry.day.isEmpty else { return }
            let current = output[entry.day] ?? (0, 0)
            output[entry.day] = (
                current.0 + Self.finiteOrZero(entry.agentStarts),
                current.1 + Self.finiteOrZero(entry.prsCreated)
            )
        }
        let tokens = (legacy.dailyTokens ?? []).reduce(into: [String: Double]()) { output, entry in
            guard !entry.day.isEmpty else { return }
            output[entry.day, default: 0] += Self.finiteOrZero(entry.tokens)
        }
        let values = (legacy.dailyValues ?? []).reduce(into: [String: Double]()) { output, entry in
            guard !entry.day.isEmpty else { return }
            output[entry.day, default: 0] += Self.finiteOrZero(entry.valueUsd)
        }
        let days = Set(activities.keys).union(tokens.keys).union(values.keys).sorted()
        daily = days.map { day in
            ActivityDailyPoint(
                day: day,
                activity: activities[day].map { $0.0 + $0.1 } ?? 0,
                tokens: tokens[day] ?? 0,
                valueUSD: values[day]
            )
        }
        dailyProviders = (legacy.dailyProviderUsage ?? []).map { entry in
            ActivityDailyProviderUsage(
                day: entry.day,
                providers: entry.providers.map {
                    ActivityProviderUsage(
                        provider: $0.provider,
                        tokens: Self.finiteOrZero($0.tokens),
                        valueUSD: Self.finiteOrNil($0.valueUsd)
                    )
                }
            )
        }
        models = (legacy.modelUsage ?? []).map {
            ActivityBreakdown(
                id: $0.key,
                label: $0.label,
                sessions: nil,
                tokens: Self.finiteOrZero($0.tokens),
                valueUSD: Self.finiteOrNil($0.valueUsd),
                providers: []
            )
        }
        projects = (legacy.projectUsage ?? []).map {
            ActivityBreakdown(
                id: $0.key,
                label: $0.label,
                sessions: Self.finiteOrZero($0.sessions),
                tokens: Self.finiteOrZero($0.tokens),
                valueUSD: Self.finiteOrNil($0.valueUsd),
                providers: $0.providers.map {
                    ActivityProviderUsage(
                        provider: $0.provider,
                        tokens: Self.finiteOrZero($0.tokens),
                        valueUSD: Self.finiteOrNil($0.valueUsd)
                    )
                }
            )
        }
        totalAgentsSpawned = legacy.totalAgentsSpawned
        totalPRsCreated = legacy.totalPRsCreated
        totalAgentTimeMS = legacy.totalAgentTimeMs
        firstEventAt = legacy.firstEventAt
        usageRange = legacy.usageRange
        hasUsageValue = legacy.usageValueAvailable ?? !values.isEmpty
        hasUnpricedUsage = legacy.hasUnpricedUsage ?? false
        tokenDataAvailable = nil
        tokenUnavailableAgents = nil
        supplementalUsage = nil
    }

    private static func finiteOrZero(_ value: Double) -> Double {
        value.isFinite ? value : 0
    }

    private static func finiteOrNil(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return value
    }
}

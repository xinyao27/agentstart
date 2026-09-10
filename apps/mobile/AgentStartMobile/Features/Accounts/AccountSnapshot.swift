import Foundation

nonisolated enum AccountProvider: String, CaseIterable, Codable, Sendable {
    case claude
    case codex
    case cursor
    case gemini
    case opencodeGo = "opencode-go"
    case kimi
    case antigravity
    case minimax
    case grok

    var title: String {
        switch self {
        case .claude: "Claude"
        case .codex: "Codex"
        case .cursor: "Cursor"
        case .gemini: "Gemini"
        case .opencodeGo: "OpenCode Go"
        case .kimi: "Kimi"
        case .antigravity: "Antigravity"
        case .minimax: "MiniMax"
        case .grok: "Grok"
        }
    }

    var supportsSelection: Bool { self == .claude || self == .codex }
}

nonisolated struct ManagedAccount: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let email: String
    let subtitle: String?
    let organizationName: String?
    let workspaceLabel: String?

    init(
        id: String,
        email: String,
        subtitle: String?,
        organizationName: String? = nil,
        workspaceLabel: String? = nil
    ) {
        self.id = id
        self.email = email
        self.subtitle = subtitle
        self.organizationName = organizationName
        self.workspaceLabel = workspaceLabel
    }
}

nonisolated struct AccountUsageWindow: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let compactLabel: String
    let usedPercent: Double
    let resetsAt: Date?
    let windowMinutes: Double?
    let resetDescription: String?

    init(
        id: String,
        label: String,
        compactLabel: String,
        usedPercent: Double,
        resetsAt: Date?,
        windowMinutes: Double? = nil,
        resetDescription: String? = nil
    ) {
        self.id = id
        self.label = label
        self.compactLabel = compactLabel
        self.usedPercent = usedPercent
        self.resetsAt = resetsAt
        self.windowMinutes = windowMinutes
        self.resetDescription = resetDescription
    }
}

nonisolated enum AccountUsageStatus: String, Codable, Sendable {
    case idle
    case fetching
    case ok
    case error
    case unavailable
}

nonisolated struct AccountProviderUsage: Codable, Hashable, Sendable {
    let windows: [AccountUsageWindow]
    let plan: String?
    let updatedAt: Date?
    let error: String?
    let status: AccountUsageStatus
}

nonisolated struct InactiveAccountUsage: Codable, Hashable, Sendable {
    let accountID: String
    let usage: AccountProviderUsage?
    let isFetching: Bool
    let updatedAt: Date?

    init(
        accountID: String,
        usage: AccountProviderUsage?,
        isFetching: Bool,
        updatedAt: Date? = nil
    ) {
        self.accountID = accountID
        self.usage = usage
        self.isFetching = isFetching
        self.updatedAt = updatedAt
    }
}

nonisolated struct AccountProviderSection: Codable, Identifiable, Hashable, Sendable {
    let provider: AccountProvider
    let accounts: [ManagedAccount]
    let activeAccountID: String?
    let usage: AccountProviderUsage?
    let inactiveUsage: [InactiveAccountUsage]

    var id: AccountProvider { provider }
}

nonisolated struct AccountsSnapshot: Codable, Sendable {
    let sections: [AccountProviderSection]
}

extension AccountProviderUsage {
    // Why: matches the mobile accounts screen's actual visibility check (accounts.tsx) —
    // a provider section is hidden only when there are no accounts AND usage is
    // unavailable. 'idle' (not yet polled) still renders with a "Loading usage…"
    // placeholder rather than being hidden.
    nonisolated var isRenderable: Bool {
        !windows.isEmpty || status != .unavailable
    }

}

import Foundation

nonisolated enum AgentStartWidgetProvider: String, Codable, Sendable {
    case claude
    case codex
}

nonisolated struct ProviderWidgetSnapshot: Codable, Sendable {
    let name: String
    let openURL: URL
    let sessionResetsAt: Date?
    let sessionUsedPercent: Double?
    let updatedAt: Date?
    let weeklyResetsAt: Date?
    let weeklyUsedPercent: Double?
}

nonisolated struct TokenWidgetSnapshot: Codable, Sendable {
    let openURL: URL
    let todayTokens: Double
    let todayValueUSD: Double
    let weekTokens: Double
    let weekValueUSD: Double
}

nonisolated struct AgentStartWidgetSnapshot: Codable, Sendable {
    let providers: [String: ProviderWidgetSnapshot]
    let savedAt: Date
    let tokens: TokenWidgetSnapshot?
}

nonisolated enum AgentStartWidgetSnapshotStore {
    static let appGroupIdentifier = "group.com.xinyao27.agentstart.mobile"
    static let snapshotKey = "agentstart:native-widget-snapshot:v1"

    static func load() -> AgentStartWidgetSnapshot? {
        guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return nil }
        guard let data = defaults.data(forKey: snapshotKey) else { return nil }
        return try? JSONDecoder().decode(AgentStartWidgetSnapshot.self, from: data)
    }

    static func save(_ snapshot: AgentStartWidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults(suiteName: appGroupIdentifier)?.set(data, forKey: snapshotKey)
    }
}

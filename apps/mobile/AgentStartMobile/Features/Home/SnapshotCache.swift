import Foundation

nonisolated struct CachedHomeSnapshot: Codable, Sendable {
    let accounts: [String: AccountsSnapshot]
    let activityStats: [String: ActivityStatsSummary]
    let savedAt: Date
    let workspaces: [String: [WorkspaceSummary]]
}

@MainActor
final class HomeSnapshotCache {
    static let storageKey = "agentstart:native-home-snapshot:v1"

    private let defaults: UserDefaults
    private let key = HomeSnapshotCache.storageKey
    private var pendingWrite: Task<Void, Never>?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> CachedHomeSnapshot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(CachedHomeSnapshot.self, from: data)
    }

    func save(
        accounts: [String: AccountsSnapshot],
        activityStats: [String: ActivityStatsSummary],
        workspaces: [String: [WorkspaceSummary]]
    ) {
        let snapshot = CachedHomeSnapshot(
            accounts: accounts,
            activityStats: activityStats,
            savedAt: .now,
            workspaces: workspaces
        )
        pendingWrite?.cancel()
        pendingWrite = Task { [defaults, key] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            guard let data = try? JSONEncoder().encode(snapshot) else { return }
            defaults.set(data, forKey: key)
        }
    }

    func remove(hostID: String) {
        // Why: a deleted host must not reappear from the delayed offline snapshot if the app
        // exits before the next successful refresh can persist the filtered maps.
        pendingWrite?.cancel()
        pendingWrite = nil
        guard let cached = load() else { return }
        let snapshot = CachedHomeSnapshot(
            accounts: cached.accounts.filter { $0.key != hostID },
            activityStats: cached.activityStats.filter { $0.key != hostID },
            savedAt: .now,
            workspaces: cached.workspaces.filter { $0.key != hostID }
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)
    }
}

import Foundation

nonisolated struct RecentWorkspace: Codable, Hashable, Sendable {
    let hostID: String
    let workspaceID: String
    let repoID: String
}

@MainActor
struct RecentWorkspaceStore {
    private let defaults: UserDefaults
    private let key = "agentstart:native-last-visited-workspace:v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> RecentWorkspace? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(RecentWorkspace.self, from: data)
    }

    func save(host: HostProfile, workspace: WorkspaceSummary) {
        let record = RecentWorkspace(
            hostID: host.id,
            workspaceID: workspace.id,
            repoID: workspace.repoID
        )
        guard let data = try? JSONEncoder().encode(record) else { return }
        defaults.set(data, forKey: key)
    }

    func repoID(for hostID: String) -> String? {
        guard let record = load(), record.hostID == hostID, !record.repoID.isEmpty else {
            return nil
        }
        return record.repoID
    }

    func remove(hostID: String) {
        guard load()?.hostID == hostID else { return }
        defaults.removeObject(forKey: key)
    }
}

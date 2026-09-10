import Foundation

nonisolated private struct WorkspaceListCacheEntry: Codable, Sendable {
    let savedAt: Date
    let workspaces: [WorkspaceSummary]
}

@MainActor
final class WorkspaceListCache {
    private let defaults: UserDefaults
    private let key = "agentstart:native-workspace-list-cache:v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load(hostID: String) -> [WorkspaceSummary]? {
        entries()[hostID]?.workspaces
    }

    func save(_ workspaces: [WorkspaceSummary], hostID: String) {
        var values = entries()
        values[hostID] = WorkspaceListCacheEntry(savedAt: .now, workspaces: workspaces)
        guard let data = try? JSONEncoder().encode(values) else { return }
        defaults.set(data, forKey: key)
    }

    private func entries() -> [String: WorkspaceListCacheEntry] {
        guard let data = defaults.data(forKey: key) else { return [:] }
        return (try? JSONDecoder().decode([String: WorkspaceListCacheEntry].self, from: data))
            ?? [:]
    }
}

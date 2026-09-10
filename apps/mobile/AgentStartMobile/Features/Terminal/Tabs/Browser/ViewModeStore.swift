@MainActor
final class WorkspaceBrowserViewModeStore {
    static let shared = WorkspaceBrowserViewModeStore()

    private var values: [String: WorkspaceBrowserViewMode] = [:]
    private var recency: [String] = []

    func value(worktreeID: String, pageID: String?) -> WorkspaceBrowserViewMode {
        guard let key = key(worktreeID: worktreeID, pageID: pageID) else { return .web }
        return values[key] ?? .web
    }

    func save(_ value: WorkspaceBrowserViewMode, worktreeID: String, pageID: String?) {
        guard let key = key(worktreeID: worktreeID, pageID: pageID) else { return }
        values[key] = value
        recency.removeAll { $0 == key }
        recency.append(key)
        while recency.count > 40 {
            values.removeValue(forKey: recency.removeFirst())
        }
    }

    private func key(worktreeID: String, pageID: String?) -> String? {
        pageID.map { "\(worktreeID):\($0)" }
    }
}

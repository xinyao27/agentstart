import Foundation

nonisolated struct BrowserTabSummary: Hashable, Identifiable, Sendable {
    let pageID: String
    let title: String
    let url: String
    let isActive: Bool
    let worktreeID: String?

    var id: String { pageID }

    var displayTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
        return url.isEmpty ? String(localized: "New tab") : url
    }

    var displayURL: String {
        url.isEmpty ? "about:blank" : url
    }
}

import Foundation

nonisolated struct SourceCommit: Identifiable, Hashable, Sendable {
    let id: String
    let parentID: String?
    let displayID: String
    let subject: String
    let author: String
    let timestamp: Date?

    func relativeTime(now: Date) -> String {
        guard let timestamp else { return "" }
        let seconds = max(0, now.timeIntervalSince(timestamp))
        if seconds < 60 { return String(localized: "just now") }
        let minutes = Int(seconds / 60)
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        let days = hours / 24
        if days < 30 { return "\(days)d" }
        let months = days / 30
        if months < 12 { return "\(months)mo" }
        return "\(months / 12)y"
    }
}

nonisolated struct SourceCommitFile: Identifiable, Hashable, Sendable {
    let path: String
    let status: SourceFileStatus
    let oldPath: String?
    let added: Int?
    let removed: Int?

    var id: String { path }
}

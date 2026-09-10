import Foundation

nonisolated enum SourceConflictOperation: String, Hashable, Sendable {
    case merge
    case rebase
    case revert
}

nonisolated struct SourceLocalBranches: Hashable, Sendable {
    let current: String?
    let branches: [String]
}

nonisolated struct SourceBranchFile: Identifiable, Hashable, Sendable {
    let path: String
    let status: SourceFileStatus
    let oldPath: String?
    let added: Int?
    let removed: Int?

    var id: String { path }
}

nonisolated struct SourceBranchComparison: Hashable, Sendable {
    let baseRef: String
    let baseOID: String?
    let headOID: String?
    let mergeBase: String?
    let changedFiles: Int
    let commitsAhead: Int?
    let status: String
    let errorMessage: String?
    let entries: [SourceBranchFile]

    var canOpenDiff: Bool {
        status == "ready" && headOID != nil && mergeBase != nil
    }

    var summary: String {
        guard status == "ready" else {
            return errorMessage ?? String(localized: "Committed changes unavailable")
        }
        var parts = [String(localized: "\(changedFiles) files")]
        if let commitsAhead {
            parts.append(String(localized: "\(commitsAhead) commits"))
        }
        parts.append(String(localized: "vs \(baseRef)"))
        return parts.joined(separator: " · ")
    }
}

import SwiftUI

nonisolated enum SourceFileStatus: String, Hashable, Sendable {
    case modified
    case added
    case deleted
    case renamed
    case untracked
    case copied

    var label: String {
        switch self {
        case .modified: "M"
        case .added: "A"
        case .deleted: "D"
        case .renamed: "R"
        case .untracked: "U"
        case .copied: "C"
        }
    }

    @MainActor var color: Color {
        switch self {
        case .added: Theme.Colors.gitAdded
        case .deleted: Theme.Colors.gitDeleted
        case .renamed, .copied: Theme.Colors.gitRenamed
        case .untracked: Theme.Colors.gitUntracked
        case .modified: Theme.Colors.gitModified
        }
    }
}

nonisolated enum SourceStagingArea: String, Hashable, Sendable {
    case staged
    case unstaged
    case untracked

    var title: LocalizedStringResource {
        switch self {
        case .unstaged: "Changes"
        case .untracked: "Untracked Files"
        case .staged: "Staged Changes"
        }
    }
}

nonisolated enum SourceConflictStatus: Hashable, Sendable {
    case unresolved
    case resolvedLocally
}

nonisolated struct SourceFileEntry: Identifiable, Hashable, Sendable {
    let path: String
    let status: SourceFileStatus
    let area: SourceStagingArea
    let oldPath: String?
    let conflictStatus: SourceConflictStatus?
    let added: Int?
    let removed: Int?

    var id: String { "\(area.rawValue):\(path)" }
    var canOpen: Bool { conflictStatus != .unresolved }
    var canStage: Bool {
        (area == .unstaged || area == .untracked) && conflictStatus != .unresolved
    }
    var canDiscard: Bool { conflictStatus == nil }
}

nonisolated struct SourceUpstreamStatus: Hashable, Sendable {
    let hasUpstream: Bool
    let name: String?
    let ahead: Int
    let behind: Int
    let hasConfiguredPushTarget: Bool
    let behindCommitsArePatchEquivalent: Bool
}

nonisolated struct SourceStatusSnapshot: Hashable, Sendable {
    let entries: [SourceFileEntry]
    let conflictOperation: SourceConflictOperation?
    let head: String?
    let branch: String?
    let upstream: SourceUpstreamStatus?
    let didHitLimit: Bool

    var branchLabel: String {
        if let branch, branch.hasPrefix("refs/heads/") {
            return String(branch.dropFirst("refs/heads/".count))
        }
        if let branch, !branch.isEmpty { return branch }
        if let head, !head.isEmpty { return String(head.prefix(7)) }
        return String(localized: "No branch")
    }

    var staged: [SourceFileEntry] { entries.filter { $0.area == .staged } }
    var stageable: [SourceFileEntry] { entries.filter(\.canStage) }
    var changedCount: Int { entries.filter { $0.area != .staged }.count }
    var unresolvedCount: Int { entries.filter { $0.conflictStatus == .unresolved }.count }
}

nonisolated struct SourceStatusSection: Identifiable, Hashable, Sendable {
    let area: SourceStagingArea
    let entries: [SourceFileEntry]

    var id: SourceStagingArea { area }
    var title: LocalizedStringResource { area.title }
}

nonisolated enum SourceStatusProjection {
    private static let areaOrder: [SourceStagingArea] = [.unstaged, .untracked, .staged]

    static func sections(_ snapshot: SourceStatusSnapshot) -> [SourceStatusSection] {
        areaOrder.compactMap { area in
            let entries = snapshot.entries
                .filter { $0.area == area }
                .sorted(by: compare)
            return entries.isEmpty ? nil : SourceStatusSection(area: area, entries: entries)
        }
    }

    private static func compare(_ left: SourceFileEntry, _ right: SourceFileEntry) -> Bool {
        let leftRank = conflictRank(left)
        let rightRank = conflictRank(right)
        if leftRank != rightRank { return leftRank < rightRank }
        return left.path.localizedStandardCompare(right.path) == .orderedAscending
    }

    private static func conflictRank(_ entry: SourceFileEntry) -> Int {
        switch entry.conflictStatus {
        case .unresolved: 0
        case .resolvedLocally: 1
        case nil: 2
        }
    }
}

nonisolated enum SourcePrimaryAction: Hashable, Sendable {
    case commit(enabled: Bool)
    case stageAll
    case publish
    case sync
    case pull
    case push(forceWithLease: Bool)
    case current

    var label: LocalizedStringResource {
        switch self {
        case .commit: "Commit"
        case .stageAll: "Stage All"
        case .publish: "Publish Branch"
        case .sync: "Sync"
        case .pull: "Pull"
        case .push(let forceWithLease): forceWithLease ? "Force Push" : "Push"
        case .current: "Up to date"
        }
    }

    var isEnabled: Bool {
        switch self {
        case .commit(let enabled): enabled
        case .current: false
        default: true
        }
    }
}

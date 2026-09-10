import Foundation

nonisolated enum SourceReviewScope: String, CaseIterable, Hashable, Sendable {
    case unstaged
    case staged
    case branch

    var title: LocalizedStringResource {
        switch self {
        case .unstaged: "Unstaged"
        case .staged: "Staged"
        case .branch: "Branch"
        }
    }
}

nonisolated enum SourceReviewFilter: String, CaseIterable, Identifiable, Hashable, Sendable {
    case all
    case unreviewed
    case notes
    case unstaged
    case staged
    case branch

    var id: Self { self }

    var title: LocalizedStringResource {
        switch self {
        case .all: "All"
        case .unreviewed: "Unreviewed"
        case .notes: "Notes"
        case .unstaged: "Unstaged"
        case .staged: "Staged"
        case .branch: "Branch"
        }
    }
}

nonisolated struct SourceReviewComment: Identifiable, Hashable, Sendable {
    let id: String
    let worktreeID: String
    let filePath: String
    let source: String?
    let selectedText: String?
    let startLine: Int?
    let lineNumber: Int
    let body: String
    let createdAt: Double
    let updatedAt: Double?
    let sentAt: Double?
    let scope: SourceReviewScope?
    let oldPath: String?
    let diffIdentity: String?
}

nonisolated struct SourceReviewFileState: Hashable, Sendable {
    let key: String
    let filePath: String
    let oldPath: String?
    let scope: SourceReviewScope
    let lastOpenedAt: Double?
    let lastSeenDiffIdentity: String?
    let reviewedAt: Double?
    let reviewDiffIdentity: String?
}

nonisolated struct SourceReviewState: Hashable, Sendable {
    let updatedAt: Double?
    let completedAt: Double?
    let files: [String: SourceReviewFileState]

    static let empty = SourceReviewState(updatedAt: nil, completedAt: nil, files: [:])
}

nonisolated struct SourceReviewItem: Identifiable, Hashable, Sendable {
    let id: String
    let scope: SourceReviewScope
    let area: String
    let filePath: String
    let oldPath: String?
    let status: SourceFileStatus
    let added: Int?
    let removed: Int?
    let canStage: Bool
    let canUnstage: Bool
    let canDiscard: Bool
    let isGeneratedOrLockFile: Bool
    let diffIdentity: String
    let noteCount: Int
    let unsentNoteCount: Int
    let staleNoteCount: Int
    let reviewedAt: Double?
    let isReviewed: Bool
    let changedSinceReview: Bool
}

nonisolated struct SourceReviewSnapshot: Hashable, Sendable {
    let status: SourceStatusSnapshot
    let branchComparison: SourceBranchComparison?
    let comments: [SourceReviewComment]
    let reviewState: SourceReviewState
    let items: [SourceReviewItem]
}

nonisolated struct SourceReviewTarget: Hashable, Sendable {
    let filePath: String?
    let scope: SourceReviewScope?
    let filter: SourceReviewFilter?

    static let all = SourceReviewTarget(filePath: nil, scope: nil, filter: nil)
}

nonisolated enum SourceReviewProjection {
    static func items(
        worktreeID: String,
        status: SourceStatusSnapshot,
        branch: SourceBranchComparison?,
        comments: [SourceReviewComment],
        state: SourceReviewState
    ) -> [SourceReviewItem] {
        let working = status.entries.map { entry in
            let scope: SourceReviewScope = entry.area == .staged ? .staged : .unstaged
            let identity = diffIdentity([
                scope.rawValue,
                entry.area.rawValue,
                entry.status.rawValue,
                entry.oldPath ?? "",
                entry.path,
                entry.added.map(String.init) ?? "",
                entry.removed.map(String.init) ?? "",
                conflictLabel(entry.conflictStatus),
            ])
            return item(
                key: key(
                    scope: scope, area: entry.area.rawValue, path: entry.path,
                    oldPath: entry.oldPath),
                scope: scope,
                area: entry.area.rawValue,
                path: entry.path,
                oldPath: entry.oldPath,
                status: entry.status,
                added: entry.added,
                removed: entry.removed,
                canStage: entry.canStage,
                canUnstage: entry.area == .staged,
                canDiscard: entry.area != .staged && entry.canDiscard,
                identity: identity,
                comments: comments,
                state: state
            )
        }
        let committed: [SourceReviewItem] =
            branch?.canOpenDiff == true
            ? (branch?.entries ?? []).map { entry in
                let identity = diffIdentity([
                    SourceReviewScope.branch.rawValue,
                    branch?.mergeBase ?? "",
                    branch?.headOID ?? "",
                    entry.status.rawValue,
                    entry.oldPath ?? "",
                    entry.path,
                    entry.added.map(String.init) ?? "",
                    entry.removed.map(String.init) ?? "",
                ])
                return item(
                    key: key(
                        scope: .branch, area: "branch", path: entry.path, oldPath: entry.oldPath),
                    scope: .branch,
                    area: "branch",
                    path: entry.path,
                    oldPath: entry.oldPath,
                    status: entry.status,
                    added: entry.added,
                    removed: entry.removed,
                    canStage: false,
                    canUnstage: false,
                    canDiscard: false,
                    identity: identity,
                    comments: comments,
                    state: state
                )
            } : []
        _ = worktreeID
        return (working + committed).sorted(by: compare)
    }

    static func mergedState(
        _ state: SourceReviewState,
        items: [SourceReviewItem],
        now: Double
    ) -> SourceReviewState {
        var files = state.files
        var invalidatedCompletion = false
        for item in items {
            let previous = files[item.id]
            let changed =
                previous?.reviewedAt != nil
                && previous?.reviewDiffIdentity != nil
                && previous?.reviewDiffIdentity != item.diffIdentity
            invalidatedCompletion = invalidatedCompletion || changed
            files[item.id] = SourceReviewFileState(
                key: item.id,
                filePath: item.filePath,
                oldPath: item.oldPath,
                scope: item.scope,
                lastOpenedAt: previous?.lastOpenedAt,
                lastSeenDiffIdentity: previous?.lastSeenDiffIdentity,
                reviewedAt: changed ? nil : previous?.reviewedAt,
                reviewDiffIdentity: changed ? nil : previous?.reviewDiffIdentity
            )
        }
        return SourceReviewState(
            updatedAt: now,
            completedAt: invalidatedCompletion ? nil : state.completedAt,
            files: files
        )
    }

    static func filter(_ items: [SourceReviewItem], by filter: SourceReviewFilter)
        -> [SourceReviewItem]
    {
        switch filter {
        case .all: items
        case .unreviewed: items.filter { !$0.isReviewed }
        case .notes: items.filter { $0.noteCount > 0 }
        case .unstaged: items.filter { $0.scope == .unstaged }
        case .staged: items.filter { $0.scope == .staged }
        case .branch: items.filter { $0.scope == .branch }
        }
    }

    static func comment(_ comment: SourceReviewComment, matches item: SourceReviewItem) -> Bool {
        guard comment.source != "markdown", comment.filePath == item.filePath else { return false }
        if let scope = comment.scope, scope != item.scope { return false }
        if let oldPath = comment.oldPath, oldPath != item.oldPath { return false }
        return true
    }

    static func markReviewed(
        state: SourceReviewState,
        item: SourceReviewItem,
        now: Double,
        isComplete: Bool
    ) -> SourceReviewState {
        var files = state.files
        let previous = files[item.id]
        files[item.id] = SourceReviewFileState(
            key: item.id,
            filePath: item.filePath,
            oldPath: item.oldPath,
            scope: item.scope,
            lastOpenedAt: previous?.lastOpenedAt,
            lastSeenDiffIdentity: item.diffIdentity,
            reviewedAt: now,
            reviewDiffIdentity: item.diffIdentity
        )
        return SourceReviewState(
            updatedAt: now,
            completedAt: isComplete ? now : state.completedAt,
            files: files
        )
    }

    static func markUnreviewed(
        state: SourceReviewState,
        item: SourceReviewItem,
        now: Double
    ) -> SourceReviewState {
        guard let previous = state.files[item.id] else { return state }
        var files = state.files
        files[item.id] = SourceReviewFileState(
            key: previous.key,
            filePath: previous.filePath,
            oldPath: previous.oldPath,
            scope: previous.scope,
            lastOpenedAt: previous.lastOpenedAt,
            lastSeenDiffIdentity: previous.lastSeenDiffIdentity,
            reviewedAt: nil,
            reviewDiffIdentity: nil
        )
        return SourceReviewState(updatedAt: now, completedAt: nil, files: files)
    }

    private static func item(
        key: String,
        scope: SourceReviewScope,
        area: String,
        path: String,
        oldPath: String?,
        status: SourceFileStatus,
        added: Int?,
        removed: Int?,
        canStage: Bool,
        canUnstage: Bool,
        canDiscard: Bool,
        identity: String,
        comments: [SourceReviewComment],
        state: SourceReviewState
    ) -> SourceReviewItem {
        let matching = comments.filter {
            $0.source != "markdown" && $0.filePath == path
                && ($0.scope == nil || $0.scope == scope)
                && ($0.oldPath == nil || $0.oldPath == oldPath)
        }
        let fileState = state.files[key]
        return SourceReviewItem(
            id: key,
            scope: scope,
            area: area,
            filePath: path,
            oldPath: oldPath,
            status: status,
            added: added,
            removed: removed,
            canStage: canStage,
            canUnstage: canUnstage,
            canDiscard: canDiscard,
            isGeneratedOrLockFile: isGenerated(path),
            diffIdentity: identity,
            noteCount: matching.count,
            unsentNoteCount: matching.filter { $0.sentAt == nil }.count,
            staleNoteCount: matching.filter {
                $0.diffIdentity != nil && $0.diffIdentity != identity
            }.count,
            reviewedAt: fileState?.reviewedAt,
            isReviewed: fileState?.reviewedAt != nil
                && fileState?.reviewDiffIdentity == identity,
            changedSinceReview: fileState?.reviewedAt != nil
                && fileState?.reviewDiffIdentity != nil
                && fileState?.reviewDiffIdentity != identity
        )
    }

    private static func key(
        scope: SourceReviewScope,
        area: String,
        path: String,
        oldPath: String?
    ) -> String {
        [scope.rawValue, area, oldPath ?? "", path].joined(separator: "\0")
    }

    private static func compare(_ left: SourceReviewItem, _ right: SourceReviewItem) -> Bool {
        let scopeOrder: [SourceReviewScope: Int] = [.unstaged: 0, .staged: 1, .branch: 2]
        if scopeOrder[left.scope] != scopeOrder[right.scope] {
            return scopeOrder[left.scope, default: 0] < scopeOrder[right.scope, default: 0]
        }
        if left.isGeneratedOrLockFile != right.isGeneratedOrLockFile {
            return !left.isGeneratedOrLockFile
        }
        return left.filePath.localizedStandardCompare(right.filePath) == .orderedAscending
    }

    private static func isGenerated(_ path: String) -> Bool {
        let value = path.lowercased()
        return value.hasSuffix("package-lock.json") || value.hasSuffix("pnpm-lock.yaml")
            || value.hasSuffix("yarn.lock") || value.hasSuffix("bun.lockb")
            || value.hasSuffix(".lock") || value.contains("/dist/")
            || value.contains("/build/") || value.contains("/coverage/")
            || value.hasSuffix(".generated.ts") || value.hasSuffix(".generated.tsx")
    }

    private static func conflictLabel(_ status: SourceConflictStatus?) -> String {
        switch status {
        case .unresolved: "unresolved"
        case .resolvedLocally: "resolved_locally"
        case nil: ""
        }
    }

    private static func diffIdentity(_ parts: [String]) -> String {
        var hash: UInt32 = 2_166_136_261
        for part in parts {
            let units = Array(part.utf16)
            hash = (hash ^ UInt32(units.count)) &* 16_777_619
            for unit in units { hash = (hash ^ UInt32(unit)) &* 16_777_619 }
        }
        return "d\(base36(hash))"
    }

    private static func base36(_ value: UInt32) -> String {
        let digits = Array("0123456789abcdefghijklmnopqrstuvwxyz")
        guard value != 0 else { return "0" }
        var number = value
        var result: [Character] = []
        while number > 0 {
            result.append(digits[Int(number % 36)])
            number /= 36
        }
        return String(result.reversed())
    }
}

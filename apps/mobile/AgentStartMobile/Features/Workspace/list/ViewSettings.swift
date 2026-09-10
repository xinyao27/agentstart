import Foundation

nonisolated enum WorkspaceListSortMode: String, Sendable {
    case smart
    case name
    case recent
    case repo
    case manual
}

nonisolated struct WorkspaceListViewSettings: Sendable {
    var sortMode: WorkspaceListSortMode
    var hideSleeping: Bool
    var hideDefaultBranch: Bool
    var filterRepoIDs: Set<String>
    var collapsedGroups: Set<String>

    static let standard = WorkspaceListViewSettings(
        sortMode: .recent,
        hideSleeping: false,
        hideDefaultBranch: false,
        filterRepoIDs: [],
        collapsedGroups: []
    )
}

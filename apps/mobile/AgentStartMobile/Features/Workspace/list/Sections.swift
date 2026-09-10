import Foundation

nonisolated enum WorkspaceListSectionKind: Hashable, Sendable {
    case pinned
    case repo(WorkspaceRepo?)
}

nonisolated struct WorkspaceListRowState: Identifiable, Hashable, Sendable {
    let id: String
    let workspace: WorkspaceSummary
    let lineageDepth: Int
    let endsProjectRail: Bool
}

nonisolated struct WorkspaceListSection: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let kind: WorkspaceListSectionKind
    let rows: [WorkspaceListRowState]
}

nonisolated func buildWorkspaceListSections(
    snapshot: WorkspaceSnapshot,
    searchText: String,
    viewSettings: WorkspaceListViewSettings,
    now: Date
) -> [WorkspaceListSection] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let visible = snapshot.workspaces.filter { workspace in
        guard !workspace.isArchived else { return false }
        if viewSettings.hideSleeping, !isWorkspaceActive(workspace) { return false }
        if viewSettings.hideDefaultBranch, isDefaultBranchWorkspace(workspace) { return false }
        if !viewSettings.filterRepoIDs.isEmpty,
            !viewSettings.filterRepoIDs.contains(workspace.repoID)
        {
            return false
        }
        guard !query.isEmpty else { return true }
        return workspace.name.lowercased().contains(query)
            || workspace.branch.lowercased().contains(query)
            || workspace.repoName.lowercased().contains(query)
    }
    let ordered = visible.sorted {
        compareWorkspace($0, $1, mode: viewSettings.sortMode, now: now)
    }
    let orderedByRepo = Dictionary(grouping: ordered, by: \.repoName)
    let workspaceIDCounts = Dictionary(grouping: ordered, by: \.id).mapValues(\.count)
    var sections: [WorkspaceListSection] = []
    let pinned = ordered.filter(\.isPinned)
    if !pinned.isEmpty {
        sections.append(
            WorkspaceListSection(
                id: "pinned",
                title: "Pinned",
                kind: .pinned,
                rows: pinned.enumerated().map { index, workspace in
                    WorkspaceListRowState(
                        id: "pinned:\(workspaceListIdentity(workspace, counts: workspaceIDCounts))",
                        workspace: workspace,
                        lineageDepth: 0,
                        endsProjectRail: index == pinned.count - 1
                    )
                }
            )
        )
    }

    var reposByName: [String: WorkspaceRepo] = [:]
    for repo in snapshot.repos {
        reposByName[repo.name] = repo
    }
    var repoNames: [String] = []
    var seenRepoNames: Set<String> = []
    let representedRepoIDs = Set(snapshot.workspaces.map(\.repoID))
    let availableRepos = snapshot.repos.filter { repo in
        // Why: add an empty repository section only when the repository has no workspace at
        // all. A search or visibility filter must not turn a temporarily hidden repository
        // into an extra row.
        guard !representedRepoIDs.contains(repo.id) else { return false }
        return (viewSettings.filterRepoIDs.isEmpty || viewSettings.filterRepoIDs.contains(repo.id))
            && (query.isEmpty || repo.name.lowercased().contains(query))
    }
    for repoName in ordered.map(\.repoName) + availableRepos.map(\.name) {
        if seenRepoNames.insert(repoName).inserted {
            repoNames.append(repoName)
        }
    }
    for repoName in repoNames {
        let sectionID = "repo:\(reposByName[repoName]?.id ?? repoName)"
        let projectWorkspaces = orderedByRepo[repoName] ?? []
        let mainFirst =
            projectWorkspaces.filter(\.isMainWorktree)
            + projectWorkspaces.filter { !$0.isMainWorktree }
        let rows =
            viewSettings.collapsedGroups.contains(sectionID)
            ? []
            : lineageRows(workspaces: mainFirst, sectionID: sectionID)
        sections.append(
            WorkspaceListSection(
                id: sectionID,
                title: repoName,
                kind: .repo(reposByName[repoName]),
                rows: rows
            )
        )
    }
    return sections
}

nonisolated private func compareWorkspace(
    _ lhs: WorkspaceSummary,
    _ rhs: WorkspaceSummary,
    mode: WorkspaceListSortMode,
    now: Date
) -> Bool {
    switch mode {
    case .name:
        return compareName(lhs, rhs)
    case .recent:
        let lhsActivity = effectiveRecentActivity(lhs, now: now)
        let rhsActivity = effectiveRecentActivity(rhs, now: now)
        return lhsActivity == rhsActivity ? compareName(lhs, rhs) : lhsActivity > rhsActivity
    case .repo:
        let repoOrder = lhs.repoName.localizedStandardCompare(rhs.repoName)
        return repoOrder == .orderedSame ? compareName(lhs, rhs) : repoOrder == .orderedAscending
    case .manual:
        let lhsRank = lhs.manualOrder ?? lhs.sortOrder
        let rhsRank = rhs.manualOrder ?? rhs.sortOrder
        if lhsRank != rhsRank { return lhsRank > rhsRank }
        return compareName(lhs, rhs)
    case .smart:
        if lhs.sortOrder != rhs.sortOrder { return lhs.sortOrder > rhs.sortOrder }
        if lhs.sortOrder != 0 { return compareName(lhs, rhs) }
        let lhsAttention = attentionRank(workspaceListActivity(lhs))
        let rhsAttention = attentionRank(workspaceListActivity(rhs))
        if lhsAttention != rhsAttention { return lhsAttention < rhsAttention }
        let lhsActivity = effectiveRecentActivity(lhs, now: now)
        let rhsActivity = effectiveRecentActivity(rhs, now: now)
        return lhsActivity == rhsActivity ? compareName(lhs, rhs) : lhsActivity > rhsActivity
    }
}

nonisolated private func compareName(_ lhs: WorkspaceSummary, _ rhs: WorkspaceSummary) -> Bool {
    lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
}

nonisolated private func isWorkspaceActive(_ workspace: WorkspaceSummary) -> Bool {
    workspace.hasHostSidebarActivity
}

nonisolated func workspaceListActivity(_ workspace: WorkspaceSummary) -> WorkspaceActivity {
    guard workspace.hasHostSidebarActivity else { return .inactive }
    return workspace.activity == .inactive ? .active : workspace.activity
}

nonisolated private func isDefaultBranchWorkspace(_ workspace: WorkspaceSummary) -> Bool {
    guard workspace.kind == .git else { return false }
    if let reportedMainWorktree = workspace.reportedMainWorktree {
        return reportedMainWorktree
            && !workspace.branch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    let branch = workspace.branch.replacingOccurrences(of: "refs/heads/", with: "")
    return branch == "main" || branch == "master"
}

nonisolated private func attentionRank(_ activity: WorkspaceActivity) -> Int {
    switch activity {
    case .permission: 0
    case .working: 1
    case .done: 2
    case .active: 3
    case .inactive: 4
    }
}

nonisolated private func effectiveRecentActivity(_ workspace: WorkspaceSummary, now: Date) -> Date {
    let activity = max(workspace.lastActivity ?? .distantPast, workspace.lastOutput ?? .distantPast)
    guard let createdAt = workspace.createdAt else { return activity }
    let graceEnd = createdAt.addingTimeInterval(5 * 60)
    return now < graceEnd ? max(activity, graceEnd) : activity
}

nonisolated private func lineageRows(
    workspaces: [WorkspaceSummary],
    sectionID: String
) -> [WorkspaceListRowState] {
    let workspacesByID = Dictionary(grouping: workspaces, by: \.id)
    let workspaceIDCounts = workspacesByID.mapValues(\.count)
    func identity(_ workspace: WorkspaceSummary) -> String {
        workspaceListIdentity(workspace, counts: workspaceIDCounts)
    }
    var childrenByParent: [String: [WorkspaceSummary]] = [:]
    var childIDs: Set<String> = []
    for workspace in workspaces {
        guard
            let parentID = workspace.parentWorktreeID,
            parentID != workspace.id,
            let parent = workspacesByID[parentID]?.first(where: {
                hasValidLineageParent(workspace, parent: $0)
            })
        else { continue }
        childrenByParent[identity(parent), default: []].append(workspace)
        childIDs.insert(identity(workspace))
    }

    var rows: [WorkspaceListRowState] = []
    var emitted: Set<String> = []
    func emit(_ workspace: WorkspaceSummary, depth: Int) {
        let workspaceIdentity = identity(workspace)
        guard emitted.insert(workspaceIdentity).inserted else { return }
        let children = childrenByParent[workspaceIdentity] ?? []
        rows.append(
            WorkspaceListRowState(
                id: "\(sectionID):\(workspaceIdentity)",
                workspace: workspace,
                lineageDepth: depth,
                endsProjectRail: false
            )
        )
        children.forEach { child in
            emit(child, depth: depth + 1)
        }
    }
    let roots = workspaces.filter { !childIDs.contains(identity($0)) }
    roots.forEach { root in
        emit(root, depth: 0)
    }
    workspaces.filter { !emitted.contains(identity($0)) }.forEach {
        emit($0, depth: 0)
    }
    // Why: the project rail spans the flattened section. A parent can be the last root while
    // still having descendants below it, so only the final emitted row may terminate the rail.
    return rows.enumerated().map { index, row in
        WorkspaceListRowState(
            id: row.id,
            workspace: row.workspace,
            lineageDepth: row.lineageDepth,
            endsProjectRail: index == rows.count - 1
        )
    }
}

nonisolated private func hasValidLineageParent(
    _ workspace: WorkspaceSummary,
    parent: WorkspaceSummary
) -> Bool {
    if workspace.lineageWorktreeInstanceID == nil && workspace.parentWorktreeInstanceID == nil {
        return true
    }
    return workspace.worktreeInstanceID == workspace.lineageWorktreeInstanceID
        && parent.worktreeInstanceID == workspace.parentWorktreeInstanceID
}

nonisolated private func workspaceListIdentity(
    _ workspace: WorkspaceSummary,
    counts: [String: Int]
) -> String {
    guard counts[workspace.id, default: 0] > 1 else { return workspace.id }
    return workspace.worktreeInstanceID ?? "\(workspace.id):\(workspace.path)"
}

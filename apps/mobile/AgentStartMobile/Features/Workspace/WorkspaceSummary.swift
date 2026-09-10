import AgentStartProtocol
import Foundation

nonisolated enum WorkspaceKind: String, Codable, Sendable {
    case git
    case folderWorkspace = "folder-workspace"
}

nonisolated enum WorkspaceActivity: String, Codable, Sendable {
    case active
    case working
    case permission
    case done
    case inactive
}

nonisolated struct WorkspacePullRequest: Codable, Hashable, Sendable {
    let number: Int
    let state: String
}

nonisolated enum WorkspaceAgentState: String, Codable, Sendable {
    case working
    case blocked
    case waiting
    case done
}

nonisolated struct WorkspaceAgent: Codable, Hashable, Sendable {
    let paneKey: String
    let parentPaneKey: String?
    let state: WorkspaceAgentState
    let agentType: String?
    let prompt: String
    let displayName: String?
    let lastAssistantMessage: String?
    let interrupted: Bool
    let stateStartedAt: Date
    let updatedAt: Date
}

nonisolated struct WorkspaceSummary: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let kind: WorkspaceKind
    let repoID: String
    private(set) var executionHostID: String? = nil
    private(set) var resumeTargetStatus: String? = nil
    private(set) var terminalPlatform: String? = nil
    private(set) var priorWorktreeIDs: [String] = []
    let repoName: String
    let path: String
    let branch: String
    let name: String
    let workspaceStatus: String
    let isArchived: Bool
    let isMainWorktree: Bool
    let reportedMainWorktree: Bool?
    var hasHostSidebarActivity: Bool
    let worktreeInstanceID: String?
    let lineageWorktreeInstanceID: String?
    let parentWorktreeInstanceID: String?
    let parentWorktreeID: String?
    let childWorktreeIDs: [String]
    let sortOrder: Double
    let manualOrder: Double?
    let createdAt: Date?
    let linkedPullRequest: WorkspacePullRequest?
    let comment: String
    var isPinned: Bool
    var isActive: Bool
    let isUnread: Bool
    var liveTerminalCount: Int
    var hasAttachedPty: Bool
    let lastActivity: Date?
    let lastOutput: Date?
    let preview: String
    var activity: WorkspaceActivity
    let agents: [WorkspaceAgent]

    // Why: the protobuf ps record mirrors the retired JSON projection; the lineage
    // instance ids it omits map to nil, which keeps the list's lineage validation
    // on its permissive nil branch instead of failing every parent pair closed.
    nonisolated init(ps: AgentStart_Runtime_V1_WorktreePsSummary) {
        id = ps.worktreeID
        kind = WorkspaceKind(rawValue: ps.workspaceKind) ?? .git
        repoID = ps.repoID
        executionHostID = ps.hostID.isEmpty ? nil : ps.hostID
        resumeTargetStatus = ps.resumeTargetStatus.isEmpty ? nil : ps.resumeTargetStatus
        terminalPlatform = ps.terminalPlatform.isEmpty ? nil : ps.terminalPlatform
        priorWorktreeIDs = ps.priorWorktreeIds
        repoName = ps.repo
        path = ps.path
        branch = ps.branch
        name = ps.displayName
        workspaceStatus = ps.workspaceStatus
        isArchived = ps.isArchived
        isMainWorktree = ps.isMainWorktree
        reportedMainWorktree = ps.isMainWorktree
        hasHostSidebarActivity = ps.hasHostSidebarActivity_p
        worktreeInstanceID = ps.hasWorktreeInstanceID ? ps.worktreeInstanceID : nil
        lineageWorktreeInstanceID =
            ps.hasLineageWorktreeInstanceID ? ps.lineageWorktreeInstanceID : nil
        parentWorktreeInstanceID =
            ps.hasParentWorktreeInstanceID ? ps.parentWorktreeInstanceID : nil
        parentWorktreeID = ps.hasParentWorktreeID ? ps.parentWorktreeID : nil
        childWorktreeIDs = ps.childWorktreeIds
        sortOrder = ps.sortOrder
        manualOrder = ps.hasManualOrder ? ps.manualOrder : nil
        createdAt = ps.hasCreatedAt ? Self.date(milliseconds: ps.createdAt) : nil
        linkedPullRequest =
            ps.hasLinkedPr
            ? WorkspacePullRequest(number: Int(ps.linkedPr.number), state: ps.linkedPr.state)
            : nil
        comment = ps.comment
        isPinned = ps.isPinned
        isActive = ps.isActive
        isUnread = ps.unread
        liveTerminalCount = Int(ps.liveTerminalCount)
        hasAttachedPty = ps.hasAttachedPty_p
        lastActivity = ps.hasLastActivityAt ? Self.date(milliseconds: ps.lastActivityAt) : nil
        lastOutput = ps.hasLastOutputAt ? Self.date(milliseconds: ps.lastOutputAt) : nil
        preview = ps.preview
        activity = WorkspaceActivity(rawValue: ps.status) ?? .inactive
        agents = ps.agents.map(WorkspaceAgent.init(ps:))
    }

    private static func date(milliseconds: Int64) -> Date {
        Date(timeIntervalSince1970: TimeInterval(milliseconds) / 1_000)
    }

    mutating func applyOptimisticActivation() {
        isActive = true
        hasHostSidebarActivity = true
    }

    mutating func applyOptimisticDeactivation() {
        isActive = false
        hasHostSidebarActivity = false
    }

    mutating func applyOptimisticSleep() {
        activity = .inactive
        hasHostSidebarActivity = false
        isActive = false
        liveTerminalCount = 0
        hasAttachedPty = false
    }

}

nonisolated enum WorkspaceRepoIcon: Hashable, Sendable {
    case lucide(name: String)
    case emoji(String)
    case image(data: Data?, url: URL?, label: String?)
}

nonisolated enum WorkspaceRepoKind: String, Hashable, Sendable {
    case git
    case folder
}

nonisolated struct WorkspaceRepoSlug: Hashable, Sendable {
    let owner: String
    let repo: String
}

nonisolated struct WorkspaceRepo: Hashable, Sendable {
    let id: String
    let path: String
    let name: String
    let badgeColor: String
    let connectionID: String?
    let icon: WorkspaceRepoIcon?
    let kind: WorkspaceRepoKind
    let slug: WorkspaceRepoSlug?
    let remoteURL: String?

    static func slug(remoteURL: String?) -> WorkspaceRepoSlug? {
        guard var value = remoteURL?.trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
        else { return nil }
        if let range = value.range(of: "github.com:") {
            value = String(value[range.upperBound...])
        } else if let range = value.range(of: "github.com/") {
            value = String(value[range.upperBound...])
        } else {
            return nil
        }
        if value.hasSuffix(".git") { value.removeLast(4) }
        let parts = value.split(separator: "/")
        guard parts.count == 2 else { return nil }
        return WorkspaceRepoSlug(owner: String(parts[0]), repo: String(parts[1]))
    }
}

nonisolated enum WorkspaceOpenTabKind: String, Hashable, Sendable {
    case terminal
    case markdown
    case file
    case browser
}

nonisolated struct WorkspaceOpenTab: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let kind: WorkspaceOpenTabKind
    let isActive: Bool
    let leafID: String?
    let terminalID: String?
    let agentID: String?

    init(
        id: String,
        title: String,
        kind: WorkspaceOpenTabKind,
        isActive: Bool,
        leafID: String? = nil,
        terminalID: String? = nil,
        agentID: String? = nil
    ) {
        self.id = id
        self.title = title
        self.kind = kind
        self.isActive = isActive
        self.leafID = leafID
        self.terminalID = terminalID
        self.agentID = agentID
    }
}

nonisolated struct WorkspaceSnapshot: Sendable {
    let workspaces: [WorkspaceSummary]
    let repos: [WorkspaceRepo]
    let totalCount: Int
    let isTruncated: Bool
}

import Foundation
import YiruProtocol

nonisolated struct WorkspaceSourceRef: Identifiable, Hashable, Sendable {
    let refName: String
    let localBranchName: String

    var id: String { "\(refName):\(localBranchName)" }
}

nonisolated enum WorkspaceSourceSelection: Hashable, Sendable {
    case branch(refName: String, localBranchName: String, isReused: Bool)
    case newBranch(String)
    case hosted(item: WorkspaceHostedSource, base: WorkspaceHostedBase)

    var label: String {
        switch self {
        case .branch(let refName, _, _): refName
        case .newBranch(let name): name
        case .hosted(let item, _): "#\(item.number) \(item.title)"
        }
    }
}

nonisolated enum WorkspaceSourceMode: String, CaseIterable, Identifiable, Sendable {
    case smart
    case github
    case branch
    case text

    var id: String { rawValue }
}

nonisolated struct WorkspaceHostedSource: Identifiable, Hashable, Sendable {
    let id: String
    let number: Int
    let title: String
    let state: String
    let url: String
    let branchName: String?
    let baseRefName: String?
    let isCrossRepository: Bool?

    init(
        id: String,
        number: Int,
        title: String,
        state: String,
        url: String,
        branchName: String?,
        baseRefName: String?,
        isCrossRepository: Bool?
    ) {
        self.id = id
        self.number = number
        self.title = title
        self.state = state
        self.url = url
        self.branchName = branchName
        self.baseRefName = baseRefName
        self.isCrossRepository = isCrossRepository
    }

    init(item: Yiru_Runtime_V1_GitHubWorkItem) {
        self.init(
            id: "github:\(item.id)",
            number: Int(item.number),
            title: item.title,
            state: hostedSourceState(item.state),
            url: item.url,
            branchName: nonEmpty(item.branchName),
            baseRefName: nonEmpty(item.baseRefName),
            isCrossRepository: item.hasIsCrossRepository ? item.isCrossRepository : nil
        )
    }
}

// Why: the Rust authority collapses unknown PR states to open (rpc/github/service/mapping.rs),
// so the projection mirrors that default instead of inventing a separate fallback.
nonisolated private func hostedSourceState(_ state: Yiru_Runtime_V1_GitHubPrState) -> String {
    switch state {
    case .closed: "closed"
    case .merged: "merged"
    case .draft: "draft"
    case .open, .unspecified, .UNRECOGNIZED: "open"
    }
}

nonisolated private func nonEmpty(_ value: String) -> String? {
    value.isEmpty ? nil : value
}

nonisolated struct WorkspaceHostedBase: Hashable, Sendable {
    let baseBranch: String
    let compareBaseRef: String?
    let pushTarget: WorkspacePushTarget?
    let branchNameOverride: String?
}

nonisolated struct WorkspacePushTarget: Hashable, Sendable {
    let remoteName: String
    let branchName: String
    let remoteURL: String?
    let wasRemoteCreated: Bool?

    init(pushTarget: Yiru_Runtime_V1_WorktreePushTarget) {
        remoteName = pushTarget.remoteName
        branchName = pushTarget.branchName
        remoteURL = pushTarget.hasRemoteURL ? pushTarget.remoteURL : nil
        wasRemoteCreated = pushTarget.hasRemoteCreated ? pushTarget.remoteCreated : nil
    }
}

nonisolated enum WorkspaceHostedSourceError: Error {
    case rejected(String)
    case githubRemoteRequired
}

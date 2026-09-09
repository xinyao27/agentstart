import Foundation
import SwiftProtobuf
import YiruProtocol

extension WorkspaceAgent {
    nonisolated init(ps: Yiru_Runtime_V1_WorktreeAgentRow) {
        paneKey = ps.paneKey
        parentPaneKey = ps.hasParentPaneKey ? ps.parentPaneKey : nil
        state = WorkspaceAgentState(rawValue: ps.state) ?? .done
        agentType = ps.hasAgentType ? ps.agentType : nil
        prompt = ps.prompt
        displayName = ps.hasDisplayName ? ps.displayName : ps.hasTaskTitle ? ps.taskTitle : nil
        lastAssistantMessage = ps.hasLastAssistantMessage ? ps.lastAssistantMessage : nil
        interrupted = ps.interrupted
        stateStartedAt = millisecondsDate(ps.stateStartedAt)
        updatedAt = millisecondsDate(ps.updatedAt)
    }
}

extension WorkspaceRepo {
    nonisolated init(repo: Yiru_Runtime_V1_Repo) {
        id = repo.id
        path = repo.path
        name = repo.displayName
        badgeColor = repo.badgeColor
        if case .text(let connectionID) = repo.connectionID.value {
            self.connectionID = connectionID
        } else {
            connectionID = nil
        }
        switch repo.kind {
        case .folder: kind = .folder
        case .git, .unspecified, .UNRECOGNIZED: kind = .git
        }
        let remoteURL: String?
        if case .identity(let identity) = repo.gitRemoteIdentity.value {
            remoteURL = identity.remoteURL
        } else {
            remoteURL = nil
        }
        self.remoteURL = remoteURL
        if case .upstream(let upstream) = repo.upstream.value {
            slug = WorkspaceRepoSlug(owner: upstream.owner, repo: upstream.repo)
        } else {
            slug = Self.slug(remoteURL: remoteURL)
        }
        switch repo.repoIcon.value {
        case .icon(let icon): self.icon = icon.workspaceRepoIcon
        case .null, .none: self.icon = nil
        }
    }
}

extension Yiru_Runtime_V1_RepoIcon {
    nonisolated var workspaceRepoIcon: WorkspaceRepoIcon? {
        guard let value = value else { return nil }
        switch value {
        case .lucideName(let name):
            return .lucide(name: name)
        case .emoji(let emoji):
            return .emoji(emoji)
        case .image(let image):
            let label = image.hasLabel ? image.label : nil
            if image.src.hasPrefix("data:image/png;base64,"),
                let delimiter = image.src.firstIndex(of: ",")
            {
                return .image(
                    data: Data(
                        base64Encoded: String(image.src[image.src.index(after: delimiter)...])
                    ),
                    url: nil,
                    label: label
                )
            }
            return .image(data: nil, url: URL(string: image.src), label: label)
        }
    }
}

nonisolated private func millisecondsDate(_ milliseconds: Int64) -> Date {
    Date(timeIntervalSince1970: TimeInterval(milliseconds) / 1_000)
}

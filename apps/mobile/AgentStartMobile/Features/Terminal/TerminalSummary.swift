import AgentStartProtocol
import Foundation

nonisolated struct TerminalTarget: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let isWritable: Bool
}

nonisolated struct TerminalSummary: Identifiable, Hashable, Sendable {
    let id: String
    let ptyID: String?
    let worktreeID: String
    let worktreePath: String
    let branch: String
    let tabID: String
    let leafID: String
    let title: String?
    let isConnected: Bool
    let isWritable: Bool
    let lastOutput: Date?
    let preview: String

    init(protocol terminal: AgentStart_Runtime_V1_TerminalSummary) {
        id = terminal.handle
        ptyID = terminal.hasPtyID ? terminal.ptyID : nil
        worktreeID = terminal.worktreeID
        worktreePath = terminal.worktreePath
        branch = terminal.branch
        tabID = terminal.tabID
        leafID = terminal.leafID
        title = terminal.hasTitle ? terminal.title : nil
        isConnected = terminal.connected
        isWritable = terminal.writable
        lastOutput =
            terminal.hasLastOutputAt
            ? Date(timeIntervalSince1970: TimeInterval(terminal.lastOutputAt) / 1_000)
            : nil
        preview = terminal.preview
    }

    var displayTitle: String {
        guard let title, !title.isEmpty else { return branch }
        return title
    }

    var target: TerminalTarget {
        TerminalTarget(id: id, title: displayTitle, isWritable: isWritable)
    }
}

nonisolated struct TerminalSnapshot: Sendable {
    let terminals: [TerminalSummary]
    let totalCount: Int
    let isTruncated: Bool
}

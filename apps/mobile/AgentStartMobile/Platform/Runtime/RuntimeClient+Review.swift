import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient: SourceReviewRepository {
    func sourceReviewMetadata(for hostID: String, worktreeID: String) async throws
        -> SourceReviewMetadata
    {
        let response = try await protocolWorktreeShow(hostID: hostID, workspaceID: worktreeID)
        let record = response.worktree
        return SourceReviewMetadata(
            comments: record.diffComments.map(sourceReviewComment),
            state: record.hasMobileDiffReview ? sourceReviewState(record.mobileDiffReview) : .empty
        )
    }

    func saveSourceReviewMetadata(
        for hostID: String,
        worktreeID: String,
        comments: [SourceReviewComment],
        state: SourceReviewState
    ) async throws {
        let revision = try await workspaceMutationRevision(hostID: hostID, workspaceID: worktreeID)
        try await protocolSetWorktree(
            hostID: hostID,
            workspaceID: worktreeID,
            revision: revision
        ) { patch in
            var list = AgentStart_Runtime_V1_WorktreeDiffCommentList()
            list.values = comments.map(worktreeDiffComment)
            patch.diffComments = list
            patch.mobileDiffReview = worktreeMobileDiffReview(state)
        }
    }

    func sourceReviewDiff(
        for hostID: String,
        worktreeID: String,
        item: SourceReviewItem,
        branchComparison: SourceBranchComparison?
    ) async throws -> SourceReviewDiff {
        if item.scope == .branch {
            guard let branchComparison else {
                throw SourceReviewRepositoryError.missingBranchComparison
            }
            let document = try await sourceBranchDiff(
                for: hostID,
                worktreeID: worktreeID,
                entry: SourceBranchFile(
                    path: item.filePath,
                    status: item.status,
                    oldPath: item.oldPath,
                    added: item.added,
                    removed: item.removed
                ),
                comparison: branchComparison
            )
            return .document(document)
        }
        do {
            var request = AgentStart_Runtime_V1_GitStatusServiceDiffRequest()
            request.worktree = reviewWorktree(worktreeID)
            request.filePath = item.filePath
            request.staged = item.scope == .staged
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitStatusServiceMethods.diff,
                request: request,
                response: AgentStart_Runtime_V1_GitStatusServiceDiffResponse.self
            )
            guard response.diff.kind != .binary else { return .binary }
            let diff = WorkspaceDiffBuilder.build(
                originalContent: response.diff.originalContent,
                modifiedContent: response.diff.modifiedContent
            )
            return .document(.diff(lines: diff.lines, isTruncated: diff.isTruncated))
        } catch {
            if item.status == .deleted { return .deleted }
            throw error
        }
    }

    func sourceReviewTerminals(for hostID: String, worktreeID: String) async throws
        -> [SourceReviewTerminal]
    {
        let snapshot = try await workspaceTabs(for: hostID, worktreeID: worktreeID)
        return snapshot.tabs.compactMap { tab in
            guard let target = tab.terminalTarget, target.isWritable else { return nil }
            return SourceReviewTerminal(id: target.id, title: tab.displayTitle)
        }
    }

    func createSourceReviewTerminal(for hostID: String, worktreeID: String) async throws
        -> SourceReviewTerminal
    {
        let snapshot = try await createWorkspaceTerminal(
            for: hostID,
            worktreeID: worktreeID,
            afterTabID: nil,
            agentID: nil
        )
        guard
            let tab = snapshot.tabs.first(where: { $0.isActive && $0.terminalTarget != nil })
                ?? snapshot.tabs.last(where: { $0.terminalTarget != nil }),
            let target = tab.terminalTarget
        else { throw SourceReviewRepositoryError.missingTerminal }
        return SourceReviewTerminal(id: target.id, title: tab.displayTitle)
    }

    func sendSourceReviewNotes(
        for hostID: String,
        terminalID: String,
        comments: [SourceReviewComment]
    ) async throws {
        let response = try await protocolTerminalSend(
            hostID: hostID,
            terminal: terminalID,
            text: sourceReviewPrompt(comments)
        )
        guard response.send.accepted else { throw SourceReviewRepositoryError.terminalRejected }
    }

    func openSourceReviewInSession(
        for hostID: String,
        worktreeID: String,
        item: SourceReviewItem
    ) async throws {
        guard item.scope != .branch else { return }
        var request = AgentStart_Runtime_V1_FilesServiceOpenDiffRequest()
        request.worktree = reviewWorktree(worktreeID)
        request.relativePath = item.filePath
        request.staged = item.scope == .staged
        _ = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1FilesServiceMethods.openDiff,
            request: request,
            response: AgentStart_Runtime_V1_FilesServiceOpenDiffResponse.self
        )
    }

    // Why: the review flows drive an agent terminal from notes, so the send shape
    // (text plus optional submit) is shared by source-control review, hosted review
    // triage, the notes sender, and quick-command launches.
    func protocolTerminalSend(
        hostID: String,
        terminal: String,
        text: String,
        enter: Bool = true
    ) async throws -> AgentStart_Runtime_V1_TerminalServiceSendResponse {
        var request = AgentStart_Runtime_V1_TerminalServiceSendRequest()
        request.terminal = terminal
        request.text = text
        request.enter = enter
        return try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1TerminalServiceMethods.send,
            request: request,
            response: AgentStart_Runtime_V1_TerminalServiceSendResponse.self
        )
    }
}

nonisolated private func reviewWorktree(_ id: String) -> String { "id:\(id)" }

nonisolated private func sourceReviewComment(_ comment: AgentStart_Runtime_V1_WorktreeDiffComment)
    -> SourceReviewComment
{
    SourceReviewComment(
        id: comment.id,
        worktreeID: comment.worktreeID,
        filePath: comment.filePath,
        source: comment.hasSource ? comment.source : nil,
        selectedText: comment.hasSelectedText ? comment.selectedText : nil,
        startLine: comment.hasStartLine ? Int(comment.startLine) : nil,
        lineNumber: comment.hasLineNumber ? Int(comment.lineNumber) : 0,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.hasUpdatedAt ? comment.updatedAt : nil,
        sentAt: comment.hasSentAt ? comment.sentAt : nil,
        scope: comment.hasScope ? SourceReviewScope(rawValue: comment.scope) : nil,
        oldPath: comment.hasOldPath ? comment.oldPath : nil,
        diffIdentity: comment.hasDiffIdentity ? comment.diffIdentity : nil
    )
}

nonisolated private func worktreeDiffComment(_ value: SourceReviewComment)
    -> AgentStart_Runtime_V1_WorktreeDiffComment
{
    var comment = AgentStart_Runtime_V1_WorktreeDiffComment()
    comment.id = value.id
    comment.worktreeID = value.worktreeID
    comment.filePath = value.filePath
    if let source = value.source { comment.source = source }
    if let selectedText = value.selectedText { comment.selectedText = selectedText }
    if let startLine = value.startLine { comment.startLine = Double(startLine) }
    comment.lineNumber = Double(value.lineNumber)
    comment.body = value.body
    comment.createdAt = value.createdAt
    if let updatedAt = value.updatedAt { comment.updatedAt = updatedAt }
    if let sentAt = value.sentAt { comment.sentAt = sentAt }
    if let scope = value.scope { comment.scope = scope.rawValue }
    if let oldPath = value.oldPath { comment.oldPath = oldPath }
    if let diffIdentity = value.diffIdentity { comment.diffIdentity = diffIdentity }
    comment.side = "modified"
    return comment
}

nonisolated private func sourceReviewState(_ review: AgentStart_Runtime_V1_WorktreeMobileDiffReview)
    -> SourceReviewState
{
    SourceReviewState(
        updatedAt: review.hasUpdatedAt ? review.updatedAt : nil,
        completedAt: review.hasCompletedAt ? review.completedAt : nil,
        files: review.files.mapValues { sourceReviewFileState($0) }
    )
}

nonisolated private func sourceReviewFileState(
    _ file: AgentStart_Runtime_V1_WorktreeMobileDiffReviewFile
)
    -> SourceReviewFileState
{
    SourceReviewFileState(
        key: file.key,
        filePath: file.filePath,
        oldPath: file.hasOldPath ? file.oldPath : nil,
        scope: SourceReviewScope(rawValue: file.scope) ?? .unstaged,
        lastOpenedAt: file.hasLastOpenedAt ? file.lastOpenedAt : nil,
        lastSeenDiffIdentity: file.hasLastSeenDiffIdentity ? file.lastSeenDiffIdentity : nil,
        reviewedAt: file.hasReviewedAt ? file.reviewedAt : nil,
        reviewDiffIdentity: file.hasReviewDiffIdentity ? file.reviewDiffIdentity : nil
    )
}

nonisolated private func worktreeMobileDiffReview(_ state: SourceReviewState)
    -> AgentStart_Runtime_V1_WorktreeMobileDiffReview
{
    var review = AgentStart_Runtime_V1_WorktreeMobileDiffReview()
    review.version = 1
    if let updatedAt = state.updatedAt { review.updatedAt = updatedAt }
    if let completedAt = state.completedAt { review.completedAt = completedAt }
    review.files = state.files.mapValues { value in
        var file = AgentStart_Runtime_V1_WorktreeMobileDiffReviewFile()
        file.key = value.key
        file.filePath = value.filePath
        if let oldPath = value.oldPath { file.oldPath = oldPath }
        file.scope = value.scope.rawValue
        if let lastOpenedAt = value.lastOpenedAt { file.lastOpenedAt = lastOpenedAt }
        if let lastSeenDiffIdentity = value.lastSeenDiffIdentity {
            file.lastSeenDiffIdentity = lastSeenDiffIdentity
        }
        if let reviewedAt = value.reviewedAt { file.reviewedAt = reviewedAt }
        if let reviewDiffIdentity = value.reviewDiffIdentity {
            file.reviewDiffIdentity = reviewDiffIdentity
        }
        return file
    }
    return review
}

nonisolated private func sourceReviewPrompt(_ comments: [SourceReviewComment]) -> String {
    let notes = formatSourceReviewComments(comments)
    return """
        You are reviewing the current worktree. Address the following mobile review notes.

        \(notes)

        After applying fixes:
        1. Summarize changed files.
        2. Run relevant tests.
        3. Tell me if anything remains risky.
        """
}

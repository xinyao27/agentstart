import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient {
    func sourceBranchCompare(
        for hostID: String,
        worktreeID: String,
        baseRef: String
    ) async throws -> SourceBranchComparison {
        var request = AgentStart_Runtime_V1_GitHistoryServiceBranchCompareRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.baseRef = baseRef
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHistoryServiceMethods.branchCompare,
            request: request,
            response: AgentStart_Runtime_V1_GitHistoryServiceBranchCompareResponse.self
        )
        let summary = response.compare.summary
        return SourceBranchComparison(
            baseRef: summary.baseRef,
            baseOID: summary.hasBaseOid ? summary.baseOid : nil,
            headOID: summary.hasHeadOid ? summary.headOid : nil,
            mergeBase: summary.hasMergeBase ? summary.mergeBase : nil,
            changedFiles: Int(summary.changedFiles),
            commitsAhead: summary.hasCommitsAhead ? Int(summary.commitsAhead) : nil,
            status: sourceCompareStatus(summary.status),
            errorMessage: summary.hasErrorMessage ? summary.errorMessage : nil,
            entries: response.compare.entries.map(sourceBranchFile)
        )
    }

    func sourceBranchDiff(
        for hostID: String,
        worktreeID: String,
        entry: SourceBranchFile,
        comparison: SourceBranchComparison
    ) async throws -> WorkspaceFileDocument {
        guard let headOID = comparison.headOID, let mergeBase = comparison.mergeBase else {
            throw SourceControlRepositoryError.unavailableBranchDiff
        }
        var request = AgentStart_Runtime_V1_GitHistoryServiceBranchDiffRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.filePath = entry.path
        if let oldPath = entry.oldPath {
            request.oldPath = oldPath
        }
        request.mergeBase = mergeBase
        request.headOid = headOID
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHistoryServiceMethods.branchDiff,
            request: request,
            response: AgentStart_Runtime_V1_GitHistoryServiceBranchDiffResponse.self
        )
        return try sourceFileDocument(response.diff)
    }

    func generateSourceCommitMessage(for hostID: String, worktreeID: String) async throws -> String
    {
        var request = AgentStart_Runtime_V1_GitGenerationServiceGenerateCommitMessageRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitGenerationServiceMethods.generateCommitMessage,
            request: request,
            response: AgentStart_Runtime_V1_GitGenerationServiceGenerateCommitMessageResponse.self
        )
        let message = response.hasMessage ? response.message : nil
        guard response.success, let message, !message.isEmpty else {
            throw SourceControlRepositoryError.rejectedGeneration(
                response.hasError ? response.error : nil
            )
        }
        return message
    }

    func cancelSourceCommitMessage(for hostID: String, worktreeID: String) async throws {
        var request = AgentStart_Runtime_V1_GitGenerationServiceCancelGenerateCommitMessageRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        try await sourceMutation(
            hostID,
            procedure: AgentStartRuntimeV1GitGenerationServiceMethods.cancelGenerateCommitMessage,
            request: request,
            response: AgentStart_Runtime_V1_GitGenerationServiceCancelGenerateCommitMessageResponse
                .self,
            isOK: { $0.ok }
        )
    }

    func sourceHistory(
        for hostID: String,
        worktreeID: String,
        limit: Int
    ) async throws -> [SourceCommit] {
        var request = AgentStart_Runtime_V1_GitHistoryServiceHistoryRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.limit = UInt32(limit)
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHistoryServiceMethods.history,
            request: request,
            response: AgentStart_Runtime_V1_GitHistoryServiceHistoryResponse.self
        )
        return response.items.map { item in
            SourceCommit(
                id: item.id,
                parentID: item.parentIds.first,
                displayID: item.displayID.isEmpty ? String(item.id.prefix(7)) : item.displayID,
                subject: item.subject.isEmpty
                    ? String(localized: "(no commit message)") : item.subject,
                author: item.hasAuthor ? item.author : "",
                timestamp: item.hasTimestampMs
                    ? Date(timeIntervalSince1970: TimeInterval(item.timestampMs) / 1_000) : nil
            )
        }
    }

    func sourceCommitFiles(
        for hostID: String,
        worktreeID: String,
        commitID: String
    ) async throws -> [SourceCommitFile] {
        var request = AgentStart_Runtime_V1_GitHistoryServiceCommitCompareRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.commitID = commitID
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHistoryServiceMethods.commitCompare,
            request: request,
            response: AgentStart_Runtime_V1_GitHistoryServiceCommitCompareResponse.self
        )
        guard sourceCompareStatus(response.compare.summary.status) == "ready" else { return [] }
        return response.compare.entries.map(sourceCommitFile)
    }
}

nonisolated private func sourceFileDocument(_ diff: AgentStart_Runtime_V1_GitDiffResult) throws
    -> WorkspaceFileDocument
{
    switch diff.kind {
    case .text:
        let built = WorkspaceDiffBuilder.build(
            originalContent: diff.originalContent,
            modifiedContent: diff.modifiedContent
        )
        return .diff(lines: built.lines, isTruncated: built.isTruncated)
    case .binary:
        guard diff.isImage else { throw WorkspaceContentError.unsupportedBinary }
        let encoded = diff.modifiedContent.isEmpty ? diff.originalContent : diff.modifiedContent
        guard let data = Data(base64Encoded: encoded) else {
            throw WorkspaceContentError.invalidImage
        }
        return .image(data: data, mimeType: diff.hasMimeType ? diff.mimeType : nil)
    case .unspecified, .UNRECOGNIZED:
        throw WorkspaceContentError.unsupportedBinary
    }
}

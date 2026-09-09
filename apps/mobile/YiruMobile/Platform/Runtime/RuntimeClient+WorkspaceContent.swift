import Foundation
import SwiftProtobuf
import YiruProtocol

extension RuntimeClient: WorkspaceContentRepository {
    func createWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String
    ) async throws -> TerminalWorkspaceSnapshot {
        let worktree = worktreeSelector(worktreeID)
        for attempt in 1...100 {
            let relativePath = attempt == 1 ? "untitled.md" : "untitled-\(attempt).md"
            do {
                var request = Yiru_Runtime_V1_FilesServiceCreateFileRequest()
                request.worktree = worktree
                request.relativePath = relativePath
                let response = try await protocolUnary(
                    hostID: hostID,
                    procedure: YiruRuntimeV1FilesServiceMethods.createFile,
                    request: request,
                    response: Yiru_Runtime_V1_FilesServiceCreateFileResponse.self
                )
                guard response.result.ok else {
                    throw TerminalWorkspaceRepositoryError.rejectedMutation
                }
            } catch let error as RuntimeTransportError
                where isExistingFileError(error) && attempt < 100
            {
                continue
            }
            let opened = try await protocolFilesOpen(
                hostID: hostID,
                worktree: worktree,
                relativePath: relativePath
            )
            guard opened.opened else { throw TerminalWorkspaceRepositoryError.rejectedMutation }
            try await Task.sleep(for: .milliseconds(300))
            return try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
        }
        throw TerminalWorkspaceRepositoryError.rejectedMutation
    }

    func readWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String,
        tab: TerminalWorkspaceTab,
        descriptor: WorkspaceMarkdownTab
    ) async throws -> WorkspaceMarkdownDocument {
        do {
            var request = Yiru_Runtime_V1_MarkdownServiceReadTabRequest()
            request.worktree = worktreeSelector(worktreeID)
            request.tabID = tab.id
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: YiruRuntimeV1MarkdownServiceMethods.readTab,
                request: request,
                response: Yiru_Runtime_V1_MarkdownServiceReadTabResponse.self
            )
            return WorkspaceMarkdownDocument(
                content: response.content,
                version: response.version,
                editable: response.editable,
                isHostDirty: response.isDirty,
                readOnlyReason: workspaceMarkdownReadOnlyReason(response)
            )
        } catch let error as RuntimeServiceError
            where error.serverCode == "renderer_unavailable"
            || (error.serverCode == "runtime_error"
                && error.serverMessage == "renderer_unavailable")
        {
            let wire = try await readWorkspaceTextFile(
                for: hostID,
                worktreeID: worktreeID,
                relativePath: descriptor.relativePath
            )
            let reason: WorkspaceMarkdownReadOnlyReason =
                wire.truncated
                ? .diskFileTooLarge
                : descriptor.isHostDirty ? .desktopHasUnsavedChanges : .desktopUnavailable
            return WorkspaceMarkdownDocument(
                content: wire.content,
                version: "",
                editable: false,
                isHostDirty: descriptor.isHostDirty,
                readOnlyReason: reason
            )
        }
    }

    func saveWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        baseVersion: String,
        content: String
    ) async throws -> WorkspaceMarkdownDocument {
        var request = Yiru_Runtime_V1_MarkdownServiceSaveTabRequest()
        request.worktree = worktreeSelector(worktreeID)
        request.tabID = tabID
        request.baseVersion = baseVersion
        request.content = content
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1MarkdownServiceMethods.saveTab,
            request: request,
            response: Yiru_Runtime_V1_MarkdownServiceSaveTabResponse.self
        )
        return WorkspaceMarkdownDocument(
            content: response.content,
            version: response.version,
            editable: true,
            isHostDirty: false,
            readOnlyReason: nil
        )
    }

    func readWorkspaceFile(
        for hostID: String,
        worktreeID: String,
        descriptor: WorkspaceFileTab
    ) async throws -> WorkspaceFileDocument {
        if let diffSource = descriptor.diffSource {
            var request = Yiru_Runtime_V1_GitStatusServiceDiffRequest()
            request.worktree = worktreeSelector(worktreeID)
            request.filePath = descriptor.relativePath
            request.staged = diffSource == .staged
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: YiruRuntimeV1GitStatusServiceMethods.diff,
                request: request,
                response: Yiru_Runtime_V1_GitStatusServiceDiffResponse.self
            )
            let wire = response.diff
            if wire.kind == .binary {
                guard wire.isImage else { throw WorkspaceContentError.unsupportedBinary }
                let encodedContent: String
                if !wire.modifiedContent.isEmpty {
                    encodedContent = wire.modifiedContent
                } else if wire.modifiedDeleted {
                    encodedContent = wire.originalContent
                } else {
                    throw WorkspaceContentError.invalidImage
                }
                guard let data = Data(base64Encoded: encodedContent) else {
                    throw WorkspaceContentError.invalidImage
                }
                return .image(
                    data: data,
                    mimeType: wire.hasMimeType ? wire.mimeType : nil
                )
            }
            let result = WorkspaceDiffBuilder.build(
                originalContent: wire.originalContent,
                modifiedContent: wire.modifiedContent
            )
            return .diff(lines: result.lines, isTruncated: result.isTruncated)
        }
        switch workspaceArtifactKind(descriptor.relativePath) {
        case .image:
            var request = Yiru_Runtime_V1_FilesServiceReadPreviewRequest()
            request.worktree = worktreeSelector(worktreeID)
            request.relativePath = descriptor.relativePath
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: YiruRuntimeV1FilesServiceMethods.readPreview,
                request: request,
                response: Yiru_Runtime_V1_FilesServiceReadPreviewResponse.self
            )
            let preview = response.result
            guard preview.isImage, !preview.content.isEmpty else {
                throw WorkspaceContentError.invalidImage
            }
            return .image(
                data: preview.content,
                mimeType: preview.hasMimeType ? preview.mimeType : nil
            )
        case .html:
            let wire = try await readWorkspaceTextFile(
                for: hostID,
                worktreeID: worktreeID,
                relativePath: descriptor.relativePath
            )
            return .html(content: wire.content, isTruncated: wire.truncated)
        case .text:
            let wire = try await readWorkspaceTextFile(
                for: hostID,
                worktreeID: worktreeID,
                relativePath: descriptor.relativePath
            )
            return .text(
                content: wire.content,
                isTruncated: wire.truncated,
                byteLength: Int64(bitPattern: wire.byteLength)
            )
        }
    }

    private func readWorkspaceTextFile(
        for hostID: String,
        worktreeID: String,
        relativePath: String
    ) async throws -> Yiru_Runtime_V1_FileReadResult {
        var request = Yiru_Runtime_V1_FilesServiceReadRequest()
        request.worktree = worktreeSelector(worktreeID)
        request.relativePath = relativePath
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1FilesServiceMethods.read,
            request: request,
            response: Yiru_Runtime_V1_FilesServiceReadResponse.self
        )
        return response.result
    }
}

nonisolated private enum WorkspaceArtifactKind {
    case image
    case html
    case text
}

nonisolated private func workspaceArtifactKind(_ path: String) -> WorkspaceArtifactKind {
    let fileExtension = URL(fileURLWithPath: path).pathExtension.lowercased()
    if ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"].contains(fileExtension) {
        return .image
    }
    if ["html", "htm"].contains(fileExtension) { return .html }
    return .text
}

nonisolated private func isExistingFileError(_ error: RuntimeTransportError) -> Bool {
    guard case .serverStatus(_, let message) = error else { return false }
    let normalized = message.lowercased()
    return normalized.contains("eexist") || normalized.contains("already exists")
}

nonisolated private func workspaceMarkdownReadOnlyReason(
    _ response: Yiru_Runtime_V1_MarkdownServiceReadTabResponse
) -> WorkspaceMarkdownReadOnlyReason? {
    guard response.hasReadOnlyReason else { return nil }
    switch response.readOnlyReason {
    case .unsupportedPreview: return .unsupportedPreview
    case .unsupportedTab: return .unsupportedTab
    case .unsupportedUntitled: return .unsupportedUntitled
    case .fileTooLarge: return .fileTooLarge
    case .unspecified: return nil
    case .UNRECOGNIZED: return nil
    }
}

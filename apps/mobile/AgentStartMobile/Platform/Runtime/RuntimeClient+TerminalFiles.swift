import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient: TerminalFileRepository {
    func resolveTerminalFile(_ request: TerminalFileOpenRequest) async throws
        -> TerminalFileDestination?
    {
        var call = AgentStart_Runtime_V1_FilesServiceResolveTerminalPathRequest()
        call.worktree = "id:\(request.worktreeID)"
        call.pathText = request.tappedFile.pathText
        if let terminalID = request.terminalID {
            call.terminal = terminalID
        }
        if let cwd = request.cwd {
            call.cwd = cwd
        }
        let response = try await protocolUnary(
            hostID: request.hostID,
            procedure: AgentStartRuntimeV1FilesServiceMethods.resolveTerminalPath,
            request: call,
            response: AgentStart_Runtime_V1_FilesServiceResolveTerminalPathResponse.self
        )
        let resolution = response.result
        guard resolution.exists, !resolution.isDirectory, resolution.hasOpenTarget,
            let target = resolution.openTarget.target
        else { return nil }
        switch target {
        case .worktreeFile(let target):
            guard let provider = terminalFileProvider(target.provider) else { return nil }
            return .worktree(
                relativePath: target.relativePath,
                absolutePath: target.absolutePath,
                provider: provider
            )
        case .absoluteFile(let target):
            return .artifact(
                TerminalArtifactSource(
                    hostID: request.hostID,
                    worktreeID: request.worktreeID,
                    absolutePath: target.absolutePath,
                    grantID: target.grantID,
                    terminalID: request.terminalID,
                    pathText: request.tappedFile.pathText,
                    cwd: request.cwd
                )
            )
        }
    }

    func openTerminalWorktreeFile(
        for hostID: String,
        worktreeID: String,
        relativePath: String
    ) async throws {
        let result = try await protocolFilesOpen(
            hostID: hostID,
            worktree: "id:\(worktreeID)",
            relativePath: relativePath
        )
        guard result.opened else { throw TerminalArtifactError.unavailable }
    }

    func loadTerminalArtifact(_ source: TerminalArtifactSource) async throws -> TerminalArtifactLoad
    {
        do {
            return try await loadTerminalArtifactOnce(source)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            guard isTerminalArtifactGrantFailure(error) else { throw error }
            guard let refreshed = try? await refreshTerminalArtifactSource(source) else {
                throw error
            }
            return try await loadTerminalArtifactOnce(refreshed)
        }
    }

    func saveTerminalArtifact(
        _ source: TerminalArtifactSource,
        content: String,
        baseContent: String
    ) async throws -> TerminalArtifactSource {
        var current = source
        do {
            let latest = try await loadTerminalArtifactOnce(current)
            current = latest.source
            guard case .text(let hostContent, _, _) = latest.document,
                hostContent == baseContent
            else { throw TerminalArtifactError.changedOnHost }
        } catch is TerminalArtifactError {
            throw TerminalArtifactError.changedOnHost
        } catch {
            guard isTerminalArtifactGrantFailure(error) else { throw error }
            current = try await refreshTerminalArtifactSource(current)
            let latest = try await loadTerminalArtifactOnce(current)
            guard case .text(let hostContent, _, _) = latest.document,
                hostContent == baseContent
            else { throw TerminalArtifactError.changedOnHost }
        }
        do {
            return try await writeTerminalArtifact(current, content: content)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            guard isTerminalArtifactGrantFailure(error) else { throw error }
            let refreshed = try await refreshTerminalArtifactSource(current)
            let latest = try await loadTerminalArtifactOnce(refreshed)
            guard case .text(let hostContent, _, _) = latest.document,
                hostContent == baseContent
            else { throw TerminalArtifactError.changedOnHost }
            return try await writeTerminalArtifact(refreshed, content: content)
        }
    }

    private func loadTerminalArtifactOnce(_ source: TerminalArtifactSource) async throws
        -> TerminalArtifactLoad
    {
        if terminalArtifactKind(source.absolutePath) == .image {
            var call = AgentStart_Runtime_V1_FilesServiceReadTerminalArtifactPreviewRequest()
            call.worktree = "id:\(source.worktreeID)"
            call.grantID = source.grantID
            call.absolutePath = source.absolutePath
            let response = try await protocolUnary(
                hostID: source.hostID,
                procedure: AgentStartRuntimeV1FilesServiceMethods.readTerminalArtifactPreview,
                request: call,
                response: AgentStart_Runtime_V1_FilesServiceReadTerminalArtifactPreviewResponse.self
            )
            let preview = response.result
            guard preview.isBinary, preview.isImage, !preview.content.isEmpty else {
                throw TerminalArtifactError.invalidImage
            }
            return TerminalArtifactLoad(
                source: source,
                document: .image(
                    data: preview.content,
                    mimeType: preview.hasMimeType ? preview.mimeType : nil
                )
            )
        }
        var call = AgentStart_Runtime_V1_FilesServiceReadTerminalArtifactRequest()
        call.worktree = "id:\(source.worktreeID)"
        call.grantID = source.grantID
        call.absolutePath = source.absolutePath
        let response = try await protocolUnary(
            hostID: source.hostID,
            procedure: AgentStartRuntimeV1FilesServiceMethods.readTerminalArtifact,
            request: call,
            response: AgentStart_Runtime_V1_FilesServiceReadTerminalArtifactResponse.self
        )
        let read = response.result
        let document: WorkspaceFileDocument =
            terminalArtifactKind(source.absolutePath) == .html
            ? .html(content: read.content, isTruncated: read.truncated)
            : .text(
                content: read.content,
                isTruncated: read.truncated,
                byteLength: Int64(read.byteLength)
            )
        return TerminalArtifactLoad(source: source, document: document)
    }

    private func refreshTerminalArtifactSource(_ source: TerminalArtifactSource) async throws
        -> TerminalArtifactSource
    {
        let request = TerminalFileOpenRequest(
            hostID: source.hostID,
            worktreeID: source.worktreeID,
            terminalID: source.terminalID,
            cwd: source.cwd,
            tappedFile: TerminalTappedFile(pathText: source.pathText, line: nil, column: nil)
        )
        guard case .artifact(let refreshed) = try await resolveTerminalFile(request),
            refreshed.absolutePath == source.absolutePath
        else { throw TerminalArtifactError.unavailable }
        return refreshed
    }

    private func writeTerminalArtifact(_ source: TerminalArtifactSource, content: String)
        async throws
        -> TerminalArtifactSource
    {
        var call = AgentStart_Runtime_V1_FilesServiceWriteTerminalArtifactRequest()
        call.worktree = "id:\(source.worktreeID)"
        call.grantID = source.grantID
        call.absolutePath = source.absolutePath
        call.content = content
        let response = try await protocolUnary(
            hostID: source.hostID,
            procedure: AgentStartRuntimeV1FilesServiceMethods.writeTerminalArtifact,
            request: call,
            response: AgentStart_Runtime_V1_FilesServiceWriteTerminalArtifactResponse.self
        )
        guard response.result.ok else { throw TerminalArtifactError.unavailable }
        return source
    }
}

nonisolated private func isTerminalArtifactGrantFailure(_ error: Error) -> Bool {
    let normalized = error.localizedDescription.lowercased()
    return normalized.contains("terminal_file_grant_expired")
        || normalized.contains("terminal_file_grant_mismatch")
        || normalized.contains("terminal_file_grant_stale")
}

nonisolated private enum TerminalArtifactKind {
    case image
    case html
    case text
}

nonisolated private func terminalArtifactKind(_ path: String) -> TerminalArtifactKind {
    switch URL(fileURLWithPath: path).pathExtension.lowercased() {
    case "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico": .image
    case "html", "htm": .html
    default: .text
    }
}

nonisolated private func terminalFileProvider(
    _ provider: AgentStart_Runtime_V1_TerminalArtifactProvider
) -> String? {
    switch provider {
    case .local: "local"
    case .ssh: "ssh"
    case .unspecified, .UNRECOGNIZED: nil
    }
}

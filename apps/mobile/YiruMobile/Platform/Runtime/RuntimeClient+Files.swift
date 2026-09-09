import Foundation
import SwiftProtobuf
import YiruProtocol

extension RuntimeClient: WorkspaceFilesRepository {
    func loadWorkspaceDirectory(
        for hostID: String,
        worktreeID: String,
        relativePath: String
    ) async throws -> [WorkspaceDirectoryEntry] {
        do {
            var request = Yiru_Runtime_V1_FilesServiceReadDirectoryRequest()
            request.worktree = "id:\(worktreeID)"
            request.relativePath = relativePath
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: YiruRuntimeV1FilesServiceMethods.readDirectory,
                request: request,
                response: Yiru_Runtime_V1_FilesServiceReadDirectoryResponse.self
            )
            return response.entries.map {
                WorkspaceDirectoryEntry(
                    name: $0.name,
                    isDirectory: $0.isDirectory,
                    isSymlink: $0.isSymlink
                )
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw WorkspaceFilesLoadFailure(
                message: workspaceFilesFailureMessage(error),
                isConnectionFailure: isRuntimeConnectionFailure(error)
            )
        }
    }

    func reconnectWorkspaceFiles(for hostID: String) async {
        await reconnect(hostID: hostID)
    }

    // Why: markdown creation and terminal file opens across two extensions share
    // this single FilesService.Open projection so the `opened` semantics stay
    // defined in one place.
    func protocolFilesOpen(
        hostID: String,
        worktree: String,
        relativePath: String
    ) async throws -> Yiru_Runtime_V1_FileOpenResult {
        var request = Yiru_Runtime_V1_FilesServiceOpenRequest()
        request.worktree = worktree
        request.relativePath = relativePath
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1FilesServiceMethods.open,
            request: request,
            response: Yiru_Runtime_V1_FilesServiceOpenResponse.self
        )
        return response.result
    }
}

nonisolated private func workspaceFilesFailureMessage(_ error: Error) -> String {
    if let message = (error as? RuntimeServiceError)?.serverMessage,
        !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
        return message
    }
    if let transportError = error as? RuntimeTransportError,
        case .serverStatus(_, let message) = transportError,
        !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
        return message
    }
    return String(localized: "Unable to load files")
}

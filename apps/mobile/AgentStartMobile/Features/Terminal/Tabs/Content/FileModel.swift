import Foundation
import Observation

nonisolated enum WorkspaceFilePhase: Sendable {
    case waiting
    case loading
    case ready(WorkspaceFileDocument)
    case empty
    case failed(LocalizedStringResource)
}

@Observable
@MainActor
final class WorkspaceFileModel {
    private(set) var phase = WorkspaceFilePhase.loading
    private(set) var isConnected = false

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let worktreeID: String
    @ObservationIgnored private let repository: any WorkspaceContentRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime

    init(
        hostID: String,
        worktreeID: String,
        repository: any WorkspaceContentRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repository = repository
        self.connectionRuntime = connectionRuntime
    }

    func observe(_ descriptor: WorkspaceFileTab) async {
        // Why: a refresh restarts this task while the host may already be connected;
        // the first connection snapshot is not a change event in that case.
        if isConnected {
            await load(descriptor)
        }
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await snapshots in updates {
            guard !Task.isCancelled else { return }
            let wasConnected = isConnected
            isConnected = snapshots[hostID]?.phase == .connected
            if !isConnected {
                if case .ready = phase {} else if case .empty = phase {} else { phase = .waiting }
                continue
            }
            guard !wasConnected else { continue }
            await load(descriptor)
        }
    }

    func load(_ descriptor: WorkspaceFileTab) async {
        guard isConnected else {
            if case .ready = phase {} else if case .empty = phase {} else { phase = .waiting }
            return
        }
        phase = .loading
        do {
            let document = try await repository.readWorkspaceFile(
                for: hostID,
                worktreeID: worktreeID,
                descriptor: descriptor
            )
            guard !Task.isCancelled else { return }
            phase = document.isEmptyText ? .empty : .ready(document)
        } catch is CancellationError {
            return
        } catch WorkspaceContentError.invalidImage, WorkspaceContentError.unsupportedBinary {
            phase = .failed("Binary preview unavailable")
        } catch {
            phase = .failed(Self.loadFailureMessage(for: error))
        }
    }

    // Why: classify each load failure distinctly — a missing file, a binary file, and a
    // transport error need different recovery, and one generic message hides which applies.
    nonisolated private static func loadFailureMessage(for error: Error) -> LocalizedStringResource
    {
        guard let runtimeError = error as? RuntimeServiceError else {
            return "Couldn't load file preview"
        }
        let normalized = (runtimeError.serverMessage ?? runtimeError.serverCode ?? "").lowercased()
        if normalized.contains("file_too_large") {
            return "File too large for mobile preview"
        }
        if normalized.contains("binary_file") {
            return "Binary preview unavailable"
        }
        if normalized.contains("remote connection dropped")
            || normalized.contains("provider unavailable")
            || normalized.contains("disconnected")
            || normalized.contains("reconnect the ssh target")
        {
            return "Unable to reach the daemon filesystem"
        }
        if normalized.contains("enoent") || normalized.contains("no such file")
            || normalized.contains("not found") || normalized.contains("does not exist")
        {
            return "File not found"
        }
        return "Couldn't load file preview"
    }

    func retry(_ descriptor: WorkspaceFileTab) async {
        guard isConnected else {
            await connectionRuntime.reconnect(hostID: hostID)
            return
        }
        await load(descriptor)
    }
}

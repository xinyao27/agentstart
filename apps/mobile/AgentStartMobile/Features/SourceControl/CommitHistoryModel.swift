import Observation

nonisolated enum SourceHistoryPhase: Sendable {
    case loading
    case waiting
    case ready
    case failed(String)
}

@Observable
@MainActor
final class SourceHistoryModel {
    private(set) var phase = SourceHistoryPhase.loading
    private(set) var isConnected = false
    private(set) var commits: [SourceCommit] = []
    private(set) var expandedCommitID: String?
    private(set) var filesByCommit: [String: [SourceCommitFile]] = [:]
    private(set) var loadingCommitID: String?

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let worktreeID: String
    @ObservationIgnored private let repository: any SourceControlRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored private var loadRevision = 0

    init(
        hostID: String,
        worktreeID: String,
        repository: any SourceControlRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repository = repository
        self.connectionRuntime = connectionRuntime
    }

    func load() async {
        guard isConnected else {
            if commits.isEmpty { phase = .waiting }
            return
        }
        loadRevision += 1
        let revision = loadRevision
        if commits.isEmpty { phase = .loading }
        do {
            let result = try await repository.sourceHistory(
                for: hostID,
                worktreeID: worktreeID,
                limit: 50
            )
            guard revision == loadRevision, !Task.isCancelled else { return }
            commits = result
            phase = .ready
        } catch is CancellationError {
            return
        } catch {
            guard revision == loadRevision else { return }
            if commits.isEmpty { phase = .failed(error.localizedDescription) }
        }
    }

    func observe() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await update in updates {
            guard !Task.isCancelled else { return }
            let connected = update[hostID]?.phase == .connected
            let becameConnected = connected && !isConnected
            isConnected = connected
            if !connected {
                if commits.isEmpty { phase = .waiting }
                continue
            }
            guard becameConnected || commits.isEmpty else { continue }
            await load()
        }
    }

    func toggle(_ commit: SourceCommit) async {
        guard isConnected else { return }
        if expandedCommitID == commit.id {
            expandedCommitID = nil
            return
        }
        expandedCommitID = commit.id
        guard filesByCommit[commit.id] == nil else { return }
        loadingCommitID = commit.id
        do {
            let files = try await repository.sourceCommitFiles(
                for: hostID,
                worktreeID: worktreeID,
                commitID: commit.id
            )
            guard expandedCommitID == commit.id, !Task.isCancelled else { return }
            filesByCommit[commit.id] = files
            loadingCommitID = nil
        } catch is CancellationError {
            return
        } catch {
            guard expandedCommitID == commit.id else { return }
            filesByCommit[commit.id] = []
            loadingCommitID = nil
        }
    }
}

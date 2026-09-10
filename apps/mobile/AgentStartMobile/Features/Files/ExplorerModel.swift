import Foundation
import Observation

nonisolated enum WorkspaceFileExplorerPhase: Sendable {
    case waiting
    case loading
    case ready
    case failed(WorkspaceFilesLoadFailure)
}

@Observable
@MainActor
final class WorkspaceFileExplorerModel {
    private(set) var phase = WorkspaceFileExplorerPhase.loading
    private(set) var cache: [String: WorkspaceDirectoryState] = [:]
    private(set) var expanded: Set<String> = []
    private(set) var isConnected = false
    // Why: mirrors SourceControlModel.liveWorktreeDisplayName — refreshed on every root
    // load (initial, reconnect, pull-to-refresh) so a rename made elsewhere is reflected,
    // unlike the WorkspaceSummary snapshot handed to this screen at navigation time.
    private(set) var liveWorktreeDisplayName: String?

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let worktreeID: String
    @ObservationIgnored private let repository: any WorkspaceFilesRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored private var revisions: [String: Int] = [:]
    @ObservationIgnored private var pendingRetries: Set<String> = []

    init(
        hostID: String,
        worktreeID: String,
        repository: any WorkspaceFilesRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repository = repository
        self.connectionRuntime = connectionRuntime
    }

    var rows: [WorkspaceFileRow] {
        WorkspaceFileProjection.rows(cache: cache, expanded: expanded)
    }

    func observe() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await snapshots in updates {
            guard !Task.isCancelled else { return }
            let wasConnected = isConnected
            isConnected = snapshots[hostID]?.phase == .connected
            if !isConnected {
                if cache[""]?.entries.isEmpty ?? true { phase = .waiting }
                continue
            }
            guard !wasConnected else { continue }
            let retries = pendingRetries
            pendingRetries.removeAll()
            if retries.isEmpty {
                await loadRoot()
            } else {
                for relativePath in retries {
                    await loadDirectory(relativePath)
                }
            }
        }
    }

    func loadRoot() async {
        await loadDirectory("")
    }

    func refresh() async {
        await loadDirectory("")
    }

    func retryRoot() async {
        guard isConnected else {
            await connectionRuntime.reconnect(hostID: hostID)
            return
        }
        if case .failed(let failure) = phase, failure.isConnectionFailure {
            await repository.reconnectWorkspaceFiles(for: hostID)
        }
        await loadRoot()
    }

    func toggle(_ row: WorkspaceFileRow) async {
        guard row.kind == .directory else { return }
        if expanded.contains(row.relativePath) {
            expanded.remove(row.relativePath)
            return
        }
        expanded.insert(row.relativePath)
        let state = cache[row.relativePath]
        guard state == nil || state?.error != nil else { return }
        guard isConnected else {
            pendingRetries.insert(row.relativePath)
            cache[row.relativePath] = WorkspaceDirectoryState(
                entries: state?.entries ?? [],
                error: String(localized: "Waiting for daemon…")
            )
            await connectionRuntime.reconnect(hostID: hostID)
            return
        }
        await loadDirectory(row.relativePath)
    }

    func retry(_ row: WorkspaceFileRow) async {
        guard isConnected else {
            pendingRetries.insert(row.relativePath)
            await connectionRuntime.reconnect(hostID: hostID)
            return
        }
        await loadDirectory(row.relativePath)
    }

    private func loadDirectory(_ relativePath: String) async {
        let isRoot = relativePath.isEmpty
        let hadRoot = !(cache[""]?.entries.isEmpty ?? true)
        guard isConnected else {
            if isRoot {
                phase = hadRoot ? .ready : .waiting
            } else {
                let state = cache[relativePath] ?? WorkspaceDirectoryState(entries: [])
                cache[relativePath] = WorkspaceDirectoryState(
                    entries: state.entries,
                    error: String(localized: "Waiting for daemon…")
                )
            }
            return
        }
        let revision = (revisions[relativePath] ?? 0) + 1
        revisions[relativePath] = revision
        if isRoot {
            // Why: independent of the directory listing fetch below — a slow/failed
            // live-name RPC must not hold up the file list, and a failure keeps the
            // last-known-good label rather than blanking it (mirrors ScreenModelRefresh.swift).
            Task {
                guard
                    let name = await repository.liveWorktreeDisplayName(
                        for: hostID,
                        worktreeID: worktreeID
                    )
                else { return }
                guard revisions[relativePath] == revision, !Task.isCancelled else { return }
                liveWorktreeDisplayName = name
            }
        }
        if isRoot, !hadRoot { phase = .loading }
        var state = cache[relativePath] ?? WorkspaceDirectoryState(entries: [])
        state.isLoading = true
        state.error = nil
        cache[relativePath] = state
        do {
            let entries = try await repository.loadWorkspaceDirectory(
                for: hostID,
                worktreeID: worktreeID,
                relativePath: relativePath
            )
            guard revisions[relativePath] == revision, !Task.isCancelled else { return }
            cache[relativePath] = WorkspaceDirectoryState(entries: entries)
            if isRoot { phase = .ready }
        } catch is CancellationError {
            return
        } catch {
            guard revisions[relativePath] == revision else { return }
            let failure =
                error as? WorkspaceFilesLoadFailure
                ?? WorkspaceFilesLoadFailure(
                    message: String(localized: "Unable to load files"),
                    isConnectionFailure: false
                )
            if isRoot, !hadRoot {
                phase = .failed(failure)
                cache[relativePath]?.isLoading = false
            } else if isRoot {
                phase = .ready
                cache[relativePath]?.isLoading = false
            } else {
                cache[relativePath] = WorkspaceDirectoryState(
                    entries: cache[relativePath]?.entries ?? [],
                    error: failure.isConnectionFailure
                        ? String(localized: "Waiting for daemon…") : failure.message
                )
            }
        }
    }
}

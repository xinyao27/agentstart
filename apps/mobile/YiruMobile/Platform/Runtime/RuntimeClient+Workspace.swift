import Foundation
import SwiftProtobuf
import YiruProtocol

extension RuntimeClient: WorkspaceRepository {
    func workspaceHostCompatibility(for hostID: String) async -> WorkspaceHostCompatibility? {
        let status: MobileRuntimeStatusWire
        do {
            status = try await preferredRuntimeStatus(for: hostID, timeout: .seconds(10))
        } catch RuntimeTransportError.unsupportedVersion {
            return .desktopTooOld(
                requiredVersion: MobileTerminalWireContract.minimumCompatibleRuntimeServerVersion
            )
        } catch {
            return nil
        }

        let desktopVersion = status.runtimeProtocolVersion ?? status.protocolVersion ?? 0
        let requiredMobileVersion =
            status.minCompatibleRuntimeClientVersion ?? status.minCompatibleMobileVersion ?? 0
        if MobileTerminalWireContract.runtimeProtocolVersion < requiredMobileVersion {
            return .mobileTooOld(requiredVersion: requiredMobileVersion)
        }
        if desktopVersion < MobileTerminalWireContract.minimumCompatibleRuntimeServerVersion {
            return .desktopTooOld(
                requiredVersion: MobileTerminalWireContract.minimumCompatibleRuntimeServerVersion
            )
        }
        return .compatible
    }

    private func preferredRuntimeStatus(for hostID: String, timeout: Duration) async throws
        -> MobileRuntimeStatusWire
    {
        try await withThrowingTaskGroup(of: MobileRuntimeStatusWire.self) { group in
            group.addTask {
                try await self.protocolStatus(hostID: hostID)
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                throw WorkspaceRepositoryError.timeout
            }
            guard let status = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return status
        }
    }

    func workspaceListViewSettings(for hostID: String) async throws -> WorkspaceListViewSettings {
        let document = try await protocolUiGet(hostID: hostID)
        return WorkspaceListViewSettings(
            sortMode: document["sortBy"]?.stringValue.flatMap(WorkspaceListSortMode.init(rawValue:))
                ?? .recent,
            hideSleeping: document["hideSleepingWorkspaces"]?.boolValue ?? false,
            hideDefaultBranch: document["hideDefaultBranchWorkspace"]?.boolValue ?? false,
            filterRepoIDs: Set(document["filterRepoIds"]?.stringList ?? []),
            collapsedGroups: Set(document["collapsedGroups"]?.stringList ?? [])
        )
    }

    func setWorkspaceCollapsedGroups(hostID: String, groups: Set<String>) async throws {
        _ = try await protocolUiSet(
            hostID: hostID,
            fields: ["collapsedGroups": .list(groups.sorted().map(RuntimeUiValue.string))]
        )
    }

    func workspaces(for hostID: String) async throws -> WorkspaceSnapshot {
        try await withThrowingTaskGroup(of: WorkspaceSnapshot.self) { group in
            group.addTask { try await self.fetchWorkspaces(for: hostID) }
            group.addTask {
                try await Task.sleep(for: self.timeout)
                throw WorkspaceRepositoryError.timeout
            }
            guard let snapshot = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return snapshot
        }
    }

    func allWorkspaceTabUpdates(for hostID: String) async throws
        -> AsyncThrowingStream<[String: [WorkspaceOpenTab]], Error>
    {
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: [String: [WorkspaceOpenTab]].self
        )
        let forwardingTask = Task {
            var tabsByWorkspace: [String: [WorkspaceOpenTab]] = [:]
            do {
                // Why: a cold connection can spend a visible frame establishing the snapshots
                // stream, so hydrate from listAll first and let the stream stay the
                // authoritative source for subsequent updates.
                if let initial = try? await self.sessionTabsAllSnapshots(hostID: hostID) {
                    for snapshot in initial {
                        tabsByWorkspace[snapshot.worktree] = mapOpenTabs(snapshot.tabs)
                    }
                    continuation.yield(tabsByWorkspace)
                }

                let source = try await self.sessionTabsAllEventUpdates(hostID: hostID)
                for try await event in source {
                    switch event {
                    case .snapshots(let snapshots):
                        tabsByWorkspace.removeAll(keepingCapacity: true)
                        for snapshot in snapshots {
                            tabsByWorkspace[snapshot.worktree] = mapOpenTabs(snapshot.tabs)
                        }
                        continuation.yield(tabsByWorkspace)
                    case .updated(let snapshot):
                        tabsByWorkspace[snapshot.worktree] = mapOpenTabs(snapshot.tabs)
                        continuation.yield(tabsByWorkspace)
                    case .end:
                        continuation.finish()
                        return
                    }
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return stream
    }

    func activateWorkspace(hostID: String, workspaceID: String) async throws {
        var request = Yiru_Runtime_V1_WorktreeServiceActivateRequest()
        request.worktree = worktreeSelector(workspaceID)
        request.notifyClients = false
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1WorktreeServiceMethods.activate,
            request: request,
            response: Yiru_Runtime_V1_WorktreeServiceActivateResponse.self
        )
        guard response.activated else { throw WorkspaceRepositoryError.rejectedMutation }
    }

    func selectWorkspaceTab(
        hostID: String,
        workspaceID: String,
        tab: WorkspaceOpenTab
    ) async throws {
        _ = try await activateWorkspaceTab(
            for: hostID,
            worktreeID: workspaceID,
            tabID: tab.id,
            leafID: tab.kind == .terminal ? tab.leafID : nil
        )
    }

    func sleepWorkspace(hostID: String, workspaceID: String) async throws {
        var request = Yiru_Runtime_V1_WorktreeServiceSleepRequest()
        request.worktree = worktreeSelector(workspaceID)
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1WorktreeServiceMethods.sleep,
            request: request,
            response: Yiru_Runtime_V1_WorktreeServiceSleepResponse.self
        )
        guard response.worktreeID == workspaceID else {
            throw WorkspaceRepositoryError.rejectedMutation
        }
    }

    func setWorkspacePinned(hostID: String, workspaceID: String, isPinned: Bool) async throws {
        let revision = try await workspaceMutationRevision(hostID: hostID, workspaceID: workspaceID)
        try await protocolSetWorktree(
            hostID: hostID,
            workspaceID: workspaceID,
            revision: revision
        ) { patch in
            patch.isPinned = isPinned
        }
    }

    func removeWorkspace(hostID: String, workspaceID: String) async throws {
        let revision = try await workspaceMutationRevision(hostID: hostID, workspaceID: workspaceID)
        var request = Yiru_Runtime_V1_WorktreeServiceRemoveRequest()
        request.worktree = worktreeSelector(workspaceID)
        request.expectedRevision = Int64(revision)
        request.force = true
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1WorktreeServiceMethods.remove,
            request: request,
            response: Yiru_Runtime_V1_WorktreeServiceRemoveResponse.self
        )
        guard response.removed else { throw WorkspaceRepositoryError.rejectedMutation }
    }

    func workspaceMutationRevision(hostID: String, workspaceID: String) async throws -> Int {
        let response = try await protocolWorktreeShow(hostID: hostID, workspaceID: workspaceID)
        guard response.hasRevision else {
            throw WorkspaceRepositoryError.rejectedMutation
        }
        return Int(response.revision)
    }

    func protocolWorktreeShow(
        hostID: String,
        workspaceID: String
    ) async throws -> Yiru_Runtime_V1_WorktreeServiceShowResponse {
        var request = Yiru_Runtime_V1_WorktreeServiceShowRequest()
        request.worktree = worktreeSelector(workspaceID)
        return try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1WorktreeServiceMethods.show,
            request: request,
            response: Yiru_Runtime_V1_WorktreeServiceShowResponse.self
        )
    }

    // Why: WorktreeService/Set decides per patch field presence whether a field is
    // touched, so each mutation fills only the fields it owns.
    func protocolSetWorktree(
        hostID: String,
        workspaceID: String,
        revision: Int,
        patch: (inout Yiru_Runtime_V1_WorktreeSetPatch) -> Void
    ) async throws {
        var request = Yiru_Runtime_V1_WorktreeServiceSetRequest()
        request.worktree = worktreeSelector(workspaceID)
        request.expectedRevision = Int64(revision)
        var value = Yiru_Runtime_V1_WorktreeSetPatch()
        patch(&value)
        request.patch = value
        _ = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1WorktreeServiceMethods.set,
            request: request,
            response: Yiru_Runtime_V1_WorktreeServiceSetResponse.self
        )
    }

    func fetchWorkspaces(for hostID: String) async throws -> WorkspaceSnapshot {
        async let repos = fetchWorkspaceRepos(for: hostID)
        var request = Yiru_Runtime_V1_WorktreeServicePsRequest()
        request.limit = 10_000
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1WorktreeServiceMethods.ps,
            request: request,
            response: Yiru_Runtime_V1_WorktreeServicePsResponse.self
        )
        return WorkspaceSnapshot(
            workspaces: response.worktrees.map(WorkspaceSummary.init(ps:)),
            repos: await repos,
            totalCount: Int(response.totalCount),
            isTruncated: response.truncated
        )
    }

    func fetchWorkspaceRepos(for hostID: String) async -> [WorkspaceRepo] {
        let response: Yiru_Runtime_V1_RepoServiceListResponse? = try? await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1RepoServiceMethods.list,
            request: Yiru_Runtime_V1_RepoServiceListRequest(),
            response: Yiru_Runtime_V1_RepoServiceListResponse.self
        )
        return response?.repos.map(WorkspaceRepo.init(repo:)) ?? []
    }

    func worktreeSelector(_ workspaceID: String) -> String {
        "id:\(workspaceID)"
    }
}

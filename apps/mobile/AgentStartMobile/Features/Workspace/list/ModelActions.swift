import Foundation

extension WorkspaceListModel {
    func activate(_ workspace: WorkspaceSummary, tab: WorkspaceOpenTab? = nil) async {
        guard !mutatingWorkspaceIDs.contains(workspace.id) else { return }
        guard beginOptimisticMutation(.activate, workspaceID: workspace.id) != nil else { return }
        await mutate(
            workspace.id,
            failure: "AgentStart could not activate this workspace.",
            rollback: { self.rollbackOptimisticMutation(workspace.id) }
        ) {
            try await repository.activateWorkspace(hostID: hostID, workspaceID: workspace.id)
            if let tab {
                try await repository.selectWorkspaceTab(
                    hostID: hostID,
                    workspaceID: workspace.id,
                    tab: tab
                )
            }
        }
    }

    func sleep(_ workspace: WorkspaceSummary) async {
        guard !mutatingWorkspaceIDs.contains(workspace.id) else { return }
        guard beginOptimisticMutation(.sleep, workspaceID: workspace.id) != nil else { return }
        await mutate(
            workspace.id,
            failure: "AgentStart could not put this workspace to sleep.",
            rollback: { self.rollbackOptimisticMutation(workspace.id) }
        ) {
            try await repository.sleepWorkspace(hostID: hostID, workspaceID: workspace.id)
        }
    }

    func togglePin(_ workspace: WorkspaceSummary) async {
        guard !mutatingWorkspaceIDs.contains(workspace.id) else { return }
        let nextPinned = !workspace.isPinned
        guard beginOptimisticMutation(.pin(nextPinned), workspaceID: workspace.id) != nil else {
            return
        }
        await mutate(
            workspace.id,
            failure: "AgentStart could not update this pinned workspace.",
            rollback: { self.rollbackOptimisticMutation(workspace.id) }
        ) {
            try await repository.setWorkspacePinned(
                hostID: hostID,
                workspaceID: workspace.id,
                isPinned: nextPinned
            )
        }
    }

    func remove(_ workspace: WorkspaceSummary) async {
        guard !mutatingWorkspaceIDs.contains(workspace.id) else { return }
        guard beginOptimisticMutation(.remove, workspaceID: workspace.id) != nil else { return }
        await mutate(
            workspace.id,
            failure: "AgentStart could not delete this worktree.",
            rollback: { self.rollbackOptimisticMutation(workspace.id) }
        ) {
            try await repository.removeWorkspace(hostID: hostID, workspaceID: workspace.id)
        }
    }

    func clearActionFailure() {
        actionFailure = nil
    }

    func mutate(
        _ workspaceID: String,
        failure: LocalizedStringResource,
        rollback: (() -> Void)? = nil,
        operation: () async throws -> Void
    ) async {
        guard mutatingWorkspaceIDs.insert(workspaceID).inserted else { return }
        defer { mutatingWorkspaceIDs.remove(workspaceID) }
        do {
            try await operation()
            await load(replacingFailure: false)
        } catch is CancellationError {
            rollback?()
            return
        } catch {
            rollback?()
            actionFailure = WorkspaceActionFailure(message: failure)
        }
    }
}

import Foundation

nonisolated enum WorkspaceListOptimisticMutation: Equatable, Sendable {
    case activate
    case sleep
    case pin(Bool)
    case remove
}

extension WorkspaceListModel {
    func workspace(for workspaceID: String) -> WorkspaceSummary? {
        snapshot?.workspaces.first { $0.id == workspaceID }
    }

    @discardableResult
    func beginOptimisticMutation(
        _ mutation: WorkspaceListOptimisticMutation,
        workspaceID: String
    ) -> WorkspaceSummary? {
        guard optimisticMutations[workspaceID] == nil,
            let current = workspace(for: workspaceID)
        else { return nil }
        optimisticBackups[workspaceID] = current
        optimisticBackupIndexes[workspaceID] = snapshot?.workspaces.firstIndex {
            $0.id == workspaceID
        }
        optimisticMutations[workspaceID] = mutation
        if case .activate = mutation {
            beginOptimisticActivation(workspaceID: workspaceID)
        }
        rebuildOptimisticSnapshot()
        return current
    }

    func finishOptimisticMutation(_ workspaceID: String) {
        let mutation = optimisticMutations[workspaceID]
        optimisticMutations.removeValue(forKey: workspaceID)
        optimisticBackups.removeValue(forKey: workspaceID)
        optimisticBackupIndexes.removeValue(forKey: workspaceID)
        if case .activate? = mutation, optimisticActiveWorkspaceID == workspaceID {
            clearOptimisticActivation()
        }
    }

    func reconcileOptimisticMutations(with snapshot: WorkspaceSnapshot) {
        let confirmedIDs = optimisticMutations.compactMap { workspaceID, mutation in
            let workspace = snapshot.workspaces.first { $0.id == workspaceID }
            let isConfirmed: Bool
            switch mutation {
            case .activate:
                isConfirmed = workspace?.isActive == true
            case .sleep:
                isConfirmed =
                    workspace.map {
                        !$0.isActive && $0.liveTerminalCount == 0 && !$0.hasAttachedPty
                    } == true
            case .pin(let isPinned):
                isConfirmed = workspace?.isPinned == isPinned
            case .remove:
                isConfirmed = workspace == nil
            }
            return isConfirmed ? workspaceID : nil
        }
        for workspaceID in confirmedIDs {
            finishOptimisticMutation(workspaceID)
        }
    }

    func rollbackOptimisticMutation(_ workspaceID: String) {
        let mutation = optimisticMutations[workspaceID]
        if case .activate? = mutation, optimisticActiveWorkspaceID == workspaceID {
            restoreOptimisticActivation()
            finishOptimisticMutation(workspaceID)
            return
        }
        guard let backup = optimisticBackups[workspaceID] else {
            finishOptimisticMutation(workspaceID)
            return
        }
        if let snapshot {
            var workspaces = snapshot.workspaces
            if let index = workspaces.firstIndex(where: { $0.id == workspaceID }) {
                workspaces[index] = backup
            } else {
                let index = min(
                    optimisticBackupIndexes[workspaceID] ?? workspaces.endIndex,
                    workspaces.endIndex
                )
                workspaces.insert(backup, at: index)
            }
            let restored = WorkspaceSnapshot(
                workspaces: workspaces,
                repos: snapshot.repos,
                totalCount: snapshot.totalCount,
                isTruncated: snapshot.isTruncated
            )
            setOptimisticSnapshot(restored)
        }
        finishOptimisticMutation(workspaceID)
    }

    func applyOptimisticMutations(to snapshot: WorkspaceSnapshot) -> WorkspaceSnapshot {
        var workspaces = snapshot.workspaces
        if let optimisticActiveWorkspaceID {
            for index in workspaces.indices {
                if workspaces[index].id == optimisticActiveWorkspaceID {
                    workspaces[index].applyOptimisticActivation()
                } else {
                    workspaces[index].applyOptimisticDeactivation()
                }
            }
        }
        for index in workspaces.indices {
            guard let mutation = optimisticMutations[workspaces[index].id] else { continue }
            switch mutation {
            case .activate:
                // Why: the global activation overlay is the single source of truth when more than
                // one activation request is in flight; letting an older request re-activate its
                // row here would make two workspaces appear selected during a fast tap sequence.
                if optimisticActiveWorkspaceID == workspaces[index].id {
                    workspaces[index].applyOptimisticActivation()
                }
            case .sleep:
                workspaces[index].applyOptimisticSleep()
            case .pin(let isPinned):
                workspaces[index].isPinned = isPinned
            case .remove:
                break
            }
        }
        workspaces.removeAll { optimisticMutations[$0.id] == .remove }
        return WorkspaceSnapshot(
            workspaces: workspaces,
            repos: snapshot.repos,
            totalCount: snapshot.totalCount,
            isTruncated: snapshot.isTruncated
        )
    }

    private func rebuildOptimisticSnapshot() {
        guard let snapshot else { return }
        let updated = applyOptimisticMutations(to: snapshot)
        setOptimisticSnapshot(updated)
    }

    func beginOptimisticActivation(workspaceID: String) {
        // Why: a fast tap sequence can leave an older activation RPC in flight while the
        // newer selection owns the visible overlay. Do not let the older RPC's failure
        // rollback restore its pre-selection row after the newer selection is active.
        for (pendingID, mutation) in optimisticMutations where pendingID != workspaceID {
            guard case .activate = mutation else { continue }
            optimisticMutations.removeValue(forKey: pendingID)
            optimisticBackups.removeValue(forKey: pendingID)
            optimisticBackupIndexes.removeValue(forKey: pendingID)
        }
        optimisticActivationBackups.removeAll(keepingCapacity: true)
        optimisticActivationBackupIndexes.removeAll(keepingCapacity: true)
        optimisticActiveWorkspaceID = workspaceID
        guard let snapshot else { return }
        for (index, workspace) in snapshot.workspaces.enumerated()
        where workspace.id == workspaceID || workspace.isActive || workspace.hasHostSidebarActivity
        {
            optimisticActivationBackups[workspace.id] = workspace
            optimisticActivationBackupIndexes[workspace.id] = index
        }
    }

    private func restoreOptimisticActivation() {
        guard let snapshot else {
            clearOptimisticActivation()
            return
        }
        var workspaces = snapshot.workspaces
        for (workspaceID, backup) in optimisticActivationBackups {
            if let index = workspaces.firstIndex(where: { $0.id == workspaceID }) {
                workspaces[index] = backup
            } else {
                let index = min(
                    optimisticActivationBackupIndexes[workspaceID] ?? workspaces.endIndex,
                    workspaces.endIndex
                )
                workspaces.insert(backup, at: index)
            }
        }
        setOptimisticSnapshot(
            WorkspaceSnapshot(
                workspaces: workspaces,
                repos: snapshot.repos,
                totalCount: snapshot.totalCount,
                isTruncated: snapshot.isTruncated
            )
        )
        clearOptimisticActivation()
    }

    private func clearOptimisticActivation() {
        optimisticActiveWorkspaceID = nil
        optimisticActivationBackups.removeAll(keepingCapacity: true)
        optimisticActivationBackupIndexes.removeAll(keepingCapacity: true)
    }
}

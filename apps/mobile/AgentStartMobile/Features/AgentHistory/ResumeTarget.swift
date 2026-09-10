import Foundation

nonisolated enum AgentHistoryResumeTargetError: Error {
    case noLocalWorkspace
    case runtimeHostedWorkspace
}

nonisolated enum AgentHistoryResumeTargetResolver {
    private struct Match {
        let workspace: WorkspaceSummary
        let path: String
        let isCurrentPath: Bool
    }

    static func resolve(
        session: AgentHistorySession,
        activeWorkspace: WorkspaceSummary,
        workspaces: [WorkspaceSummary]
    ) throws -> WorkspaceSummary {
        let sessionWorkspace = matchingWorkspace(session: session, workspaces: workspaces)
        let candidates = [sessionWorkspace, activeWorkspace]
            .compactMap { $0 }
            .reduce(into: [WorkspaceSummary]()) { values, workspace in
                if !values.contains(where: { $0.id == workspace.id }) { values.append(workspace) }
            }
        guard !candidates.isEmpty else { throw AgentHistoryResumeTargetError.noLocalWorkspace }
        if let local = candidates.first(where: isLocal) { return local }
        if candidates.contains(where: isRuntimeHosted) {
            throw AgentHistoryResumeTargetError.runtimeHostedWorkspace
        }
        throw AgentHistoryResumeTargetError.noLocalWorkspace
    }

    private static func matchingWorkspace(
        session: AgentHistorySession,
        workspaces: [WorkspaceSummary]
    ) -> WorkspaceSummary? {
        guard let cwd = session.cwd, !cwd.isEmpty else { return nil }
        return workspaces.flatMap { workspace in
            guard !workspace.isArchived else { return [Match]() }
            var matches: [Match] = []
            if contains(base: workspace.path, candidate: cwd) {
                matches.append(
                    Match(workspace: workspace, path: workspace.path, isCurrentPath: true))
            }
            for priorID in workspace.priorWorktreeIDs {
                guard let priorPath = priorPath(priorID, repoID: workspace.repoID),
                    contains(base: priorPath, candidate: cwd)
                else { continue }
                matches.append(Match(workspace: workspace, path: priorPath, isCurrentPath: false))
            }
            return matches
        }
        .max { left, right in
            let leftLength = normalized(left.path).count
            let rightLength = normalized(right.path).count
            if leftLength != rightLength { return leftLength < rightLength }
            return !left.isCurrentPath && right.isCurrentPath
        }?.workspace
    }

    private static func isLocal(_ workspace: WorkspaceSummary) -> Bool {
        if let status = workspace.resumeTargetStatus { return status == "local" }
        // Why: older hosts do not project folder scope ownership. Treating that unknown scope as
        // local can resume a host-owned transcript in the wrong runtime.
        if workspace.kind == .folderWorkspace { return false }
        return !isRuntimeHosted(workspace)
    }

    private static func isRuntimeHosted(_ workspace: WorkspaceSummary) -> Bool {
        if let status = workspace.resumeTargetStatus { return status == "runtime" }
        return workspace.executionHostID?.trimmingCharacters(in: .whitespacesAndNewlines)
            .hasPrefix("runtime:") == true
    }

    private static func contains(base: String, candidate: String) -> Bool {
        if containsNormalized(base: base, candidate: candidate) { return true }
        guard let linuxPath = wslLinuxPath(base) else { return false }
        return containsNormalized(base: linuxPath, candidate: candidate)
    }

    private static func containsNormalized(base: String, candidate: String) -> Bool {
        let root = normalized(base)
        let value = normalized(candidate)
        guard !root.isEmpty else { return false }
        return value == root || value.hasPrefix(root.hasSuffix("/") ? root : "\(root)/")
    }

    private static func normalized(_ path: String) -> String {
        var value = path.replacingOccurrences(of: "\\", with: "/")
        while value.count > 1, value.hasSuffix("/") { value.removeLast() }
        return value.lowercased()
    }

    private static func priorPath(_ worktreeID: String, repoID: String) -> String? {
        guard let separator = worktreeID.range(of: "::") else { return nil }
        guard String(worktreeID[..<separator.lowerBound]) == repoID else { return nil }
        var path = String(worktreeID[separator.upperBound...])
        if let suffix = path.range(
            of: #"::workspace:[0-9a-fA-F-]{36}$"#,
            options: .regularExpression
        ) {
            path.removeSubrange(suffix)
        }
        return path.isEmpty ? nil : path
    }

    private static func wslLinuxPath(_ path: String) -> String? {
        let parts = normalized(path).split(separator: "/", omittingEmptySubsequences: true)
        guard parts.count >= 2, parts[0] == "wsl.localhost" || parts[0] == "wsl$" else {
            return nil
        }
        let suffix = parts.dropFirst(2).joined(separator: "/")
        return suffix.isEmpty ? "/" : "/\(suffix)"
    }
}

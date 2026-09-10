import AgentStartProtocol
import Foundation

nonisolated func sourceWorktreeID(_ worktreeID: String) -> String { "id:\(worktreeID)" }

nonisolated func sourceEntry(_ entry: AgentStart_Runtime_V1_GitStatusEntry) -> SourceFileEntry {
    SourceFileEntry(
        path: entry.path,
        status: sourceFileStatus(entry.status),
        area: sourceStagingArea(entry.area),
        oldPath: entry.hasOldPath ? entry.oldPath : nil,
        conflictStatus: entry.hasConflictKind ? .unresolved : nil,
        added: entry.hasAdded ? Int(entry.added) : nil,
        removed: entry.hasRemoved ? Int(entry.removed) : nil
    )
}

nonisolated func sourceFileStatus(_ status: AgentStart_Runtime_V1_GitChangeStatus)
    -> SourceFileStatus
{
    switch status {
    case .added: .added
    case .deleted: .deleted
    case .renamed: .renamed
    case .copied: .copied
    case .untracked: .untracked
    case .modified, .unspecified, .UNRECOGNIZED: .modified
    }
}

nonisolated func sourceStagingArea(_ area: AgentStart_Runtime_V1_GitStatusArea) -> SourceStagingArea
{
    switch area {
    case .staged: .staged
    case .untracked: .untracked
    case .unstaged, .unspecified, .UNRECOGNIZED: .unstaged
    }
}

nonisolated func sourceBranchFile(_ entry: AgentStart_Runtime_V1_GitChangeEntry) -> SourceBranchFile
{
    SourceBranchFile(
        path: entry.path,
        status: sourceFileStatus(entry.status),
        oldPath: entry.hasOldPath ? entry.oldPath : nil,
        added: entry.hasAdded ? Int(entry.added) : nil,
        removed: entry.hasRemoved ? Int(entry.removed) : nil
    )
}

nonisolated func sourceCommitFile(_ entry: AgentStart_Runtime_V1_GitChangeEntry) -> SourceCommitFile
{
    SourceCommitFile(
        path: entry.path,
        status: sourceFileStatus(entry.status),
        oldPath: entry.hasOldPath ? entry.oldPath : nil,
        added: entry.hasAdded ? Int(entry.added) : nil,
        removed: entry.hasRemoved ? Int(entry.removed) : nil
    )
}

nonisolated func sourceConflictOperation(
    _ operation: AgentStart_Runtime_V1_GitConflictOperation
) -> SourceConflictOperation? {
    switch operation {
    case .merge: .merge
    case .rebase: .rebase
    case .revert: .revert
    case .cherryPick, .unspecified, .UNRECOGNIZED: nil
    }
}

nonisolated func sourceUpstreamStatus(
    _ upstream: AgentStart_Runtime_V1_GitUpstreamStatus
) -> SourceUpstreamStatus {
    SourceUpstreamStatus(
        hasUpstream: upstream.hasUpstream_p,
        name: upstream.hasUpstreamName ? upstream.upstreamName : nil,
        ahead: Int(upstream.ahead),
        behind: Int(upstream.behind),
        hasConfiguredPushTarget: upstream.hasHasConfiguredPushTarget_p
            ? upstream.hasConfiguredPushTarget_p : false,
        behindCommitsArePatchEquivalent: upstream.hasBehindCommitsArePatchEquivalent
            ? upstream.behindCommitsArePatchEquivalent : false
    )
}

nonisolated func sourceCompareStatus(_ status: AgentStart_Runtime_V1_GitCompareStatus) -> String {
    switch status {
    case .ready: "ready"
    case .invalidBase: "invalid-base"
    case .unbornHead: "unborn-head"
    case .noMergeBase: "no-merge-base"
    case .invalidCommit: "invalid-commit"
    case .error, .unspecified, .UNRECOGNIZED: "error"
    }
}

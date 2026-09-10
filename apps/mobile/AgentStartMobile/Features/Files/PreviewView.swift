import SwiftUI

nonisolated enum WorkspaceFilePreviewSource: Hashable, Sendable {
    case worktree(relativePath: String)
    case terminalArtifact(TerminalArtifactSource)
}

nonisolated struct WorkspaceFilePreviewTarget: Hashable, Sendable {
    let source: WorkspaceFilePreviewSource
    let title: String
    let line: Int?
    let column: Int?
    let metadata: String?

    init(
        source: WorkspaceFilePreviewSource,
        title: String,
        line: Int?,
        column: Int?,
        metadata: String? = nil
    ) {
        self.source = source
        self.title = title
        self.line = line
        self.column = column
        self.metadata = metadata
    }
}

struct WorkspaceFilePreviewView: View {
    let host: HostProfile
    let workspace: WorkspaceSummary
    let target: WorkspaceFilePreviewTarget
    let repository: any WorkspaceContentRepository
    let connectionRuntime: any HostConnectionRuntime
    // Why: mirrors SourceControlModel.liveWorktreeDisplayName — refreshed on every
    // (re)connect so a rename made elsewhere is reflected, unlike the WorkspaceSummary
    // snapshot handed to this screen at navigation time (see workspaceLabel).
    @State private var liveWorkspaceLabel: String?

    var body: some View {
        switch target.source {
        case .worktree(let relativePath):
            VStack(spacing: 0) {
                FilePreviewMetadata(
                    text: target.metadata ?? "\(workspaceLabel) - \(relativePath)"
                )
                WorkspaceFilePane(
                    hostID: host.id,
                    worktreeID: workspace.id,
                    title: target.title,
                    descriptor: WorkspaceFileTab(
                        relativePath: relativePath,
                        language: "",
                        diffSource: nil
                    ),
                    focusLine: target.line,
                    repository: repository,
                    connectionRuntime: connectionRuntime
                )
            }
            .navigationTitle(target.title)
            .navigationBarTitleDisplayMode(.inline)
            .task { await observeLiveWorkspaceLabel() }
        case .terminalArtifact:
            EmptyView()
        }
    }

    // Why: prefer the live name over the WorkspaceSummary snapshot handed to this
    // screen at navigation time — see liveWorkspaceLabel's doc comment.
    private var workspaceLabel: String {
        if let liveWorkspaceLabel, !liveWorkspaceLabel.isEmpty { return liveWorkspaceLabel }
        return filePreviewWorkspaceLabel(workspace)
    }

    // Why: independent of WorkspaceFilePane's own file-content load — a slow/failed
    // live-name RPC must not hold up the preview, and failure keeps the last-known-good
    // label rather than blanking it (mirrors ScreenModelRefresh.swift).
    private func observeLiveWorkspaceLabel() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [host.id])
        var wasConnected = false
        for await snapshots in updates {
            guard !Task.isCancelled else { return }
            let isConnected = snapshots[host.id]?.phase == .connected
            defer { wasConnected = isConnected }
            guard isConnected, !wasConnected else { continue }
            guard
                let name = await repository.liveWorktreeDisplayName(
                    for: host.id,
                    worktreeID: workspace.id
                ), !Task.isCancelled
            else { continue }
            liveWorkspaceLabel = name
        }
    }
}

struct FilePreviewMetadata: View {
    let text: String

    var body: some View {
        Text(verbatim: text)
            .font(.system(size: Theme.Typography.metadata))
            .foregroundStyle(Theme.Colors.mutedForeground)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.standard)
            .padding(.vertical, Theme.Spacing.extraSmall)
            .background(Theme.Colors.content)
    }
}

func filePreviewWorkspaceLabel(_ workspace: WorkspaceSummary) -> String {
    workspace.name.isEmpty ? workspace.repoName : workspace.name
}

struct WorkspaceSourceDiffView: View {
    let host: HostProfile
    let workspace: WorkspaceSummary
    let relativePath: String
    let title: String
    let source: WorkspaceFileDiffSource
    let repository: any WorkspaceContentRepository
    let connectionRuntime: any HostConnectionRuntime

    var body: some View {
        WorkspaceFilePane(
            hostID: host.id,
            worktreeID: workspace.id,
            title: title,
            descriptor: WorkspaceFileTab(
                relativePath: relativePath,
                language: "",
                diffSource: source
            ),
            repository: repository,
            connectionRuntime: connectionRuntime
        )
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

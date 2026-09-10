import SwiftUI

struct SourceHistoryView: View {
    @State private var model: SourceHistoryModel
    private let hostID: String
    private let connectionRuntime: any HostConnectionRuntime
    private let refreshRevision: Int

    init(
        hostID: String,
        worktreeID: String,
        repository: any SourceControlRepository,
        connectionRuntime: any HostConnectionRuntime,
        refreshRevision: Int
    ) {
        self.hostID = hostID
        self.connectionRuntime = connectionRuntime
        self.refreshRevision = refreshRevision
        _model = State(
            initialValue: SourceHistoryModel(
                hostID: hostID,
                worktreeID: worktreeID,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .waiting:
                AppUnavailableState(
                    "History waiting",
                    iconID: .wifiSlash,
                    description: Text("Waiting for daemon…")
                ) {
                    Button("Try again", iconID: .refresh) {
                        Task { await connectionRuntime.reconnect(hostID: hostID) }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
            case .failed(let message):
                AppUnavailableState(
                    "History unavailable",
                    iconID: .clock,
                    description: Text(verbatim: message)
                ) {
                    Button("Retry", iconID: .refresh) {
                        Task { await connectionRuntime.reconnect(hostID: hostID) }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
            case .ready where model.commits.isEmpty:
                AppUnavailableState(
                    "No Commits",
                    iconID: .clock,
                    description: Text("This branch does not have any commits yet.")
                )
            case .ready:
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(model.commits) { commit in
                            commitRow(commit)
                        }
                    }
                    .padding(.bottom, Theme.Spacing.standard)
                }
                .refreshable { await model.load() }
            }
        }
        .task(id: refreshRevision) { await model.observe() }
    }

    private func commitRow(_ commit: SourceCommit) -> some View {
        let isExpanded = model.expandedCommitID == commit.id
        return VStack(spacing: 0) {
            Button {
                Task { await model.toggle(commit) }
            } label: {
                HStack(spacing: Theme.Spacing.small) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                        Text(verbatim: commit.subject)
                            .font(.system(size: Theme.Typography.supporting))
                            .foregroundStyle(Theme.Colors.foreground)
                            .lineLimit(1)
                        Text(verbatim: commitMetadata(commit))
                            .font(
                                .system(
                                    size: Theme.Typography.metadata,
                                    design: .monospaced
                                )
                            )
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    AgentStartIcon(isExpanded ? .chevronDown : .chevronRight, size: 14)
                        .frame(width: Theme.Spacing.large)
                }
                .padding(.horizontal, Theme.Spacing.medium)
                .padding(.vertical, Theme.Spacing.medium)
                .contentShape(Rectangle())
            }
            .buttonStyle(.appPlain)
            if isExpanded { expandedFiles(commit) }
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Theme.Colors.rail.opacity(0.45))
                .frame(height: Theme.Size.hairline)
        }
    }

    @ViewBuilder
    private func expandedFiles(_ commit: SourceCommit) -> some View {
        if model.loadingCommitID == commit.id || model.filesByCommit[commit.id] == nil {
            ProgressView()
                .controlSize(.small)
                .padding(.bottom, Theme.Spacing.small)
        } else if model.filesByCommit[commit.id]?.isEmpty == true {
            Text("No file changes")
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.page)
                .padding(.bottom, Theme.Spacing.small)
        } else {
            VStack(spacing: Theme.Spacing.extraSmall) {
                ForEach(model.filesByCommit[commit.id] ?? []) { file in
                    HStack(spacing: Theme.Spacing.small) {
                        Text(verbatim: file.path)
                            .font(
                                .system(
                                    size: Theme.Typography.metadata,
                                    design: .monospaced
                                )
                            )
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                        Spacer(minLength: Theme.Spacing.extraSmall)
                        lineCounts(file)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.bottom, Theme.Spacing.small)
        }
    }

    private func lineCounts(_ file: SourceCommitFile) -> some View {
        HStack(spacing: 0) {
            // Why: `verbatim` avoids the locale thousands grouping that interpolation
            // through LocalizedStringKey would apply to these +/- line counts.
            if let added = file.added, added > 0 {
                Text(verbatim: "+\(added) ")
                    .foregroundStyle(Theme.Colors.gitAdded)
            }
            if let removed = file.removed, removed > 0 {
                Text(verbatim: "-\(removed)")
                    .foregroundStyle(Theme.Colors.gitDeleted)
            }
        }
        .font(.system(size: Theme.Typography.metadata, design: .monospaced))
    }

    private func commitMetadata(_ commit: SourceCommit) -> String {
        [commit.displayID, commit.author, commit.relativeTime(now: Date())]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}

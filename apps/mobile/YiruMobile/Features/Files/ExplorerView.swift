import SwiftUI

struct WorkspaceFileExplorerView: View {
    let workspace: WorkspaceSummary
    let openFile: (String, String) -> Void
    @State private var model: WorkspaceFileExplorerModel
    private let closeDock: (() -> Void)?

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        repository: any WorkspaceFilesRepository,
        connectionRuntime: any HostConnectionRuntime,
        closeDock: (() -> Void)? = nil,
        openFile: @escaping (String, String) -> Void
    ) {
        self.workspace = workspace
        self.openFile = openFile
        self.closeDock = closeDock
        _model = State(
            initialValue: WorkspaceFileExplorerModel(
                hostID: host.id,
                worktreeID: workspace.id,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        presentedContent
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.background)
            .task { await model.observe() }
    }

    @ViewBuilder
    private var presentedContent: some View {
        if let closeDock {
            VStack(spacing: 0) {
                DockedPanelHeader(
                    title: "Files",
                    subtitle: workspaceLabel,
                    closeLabel: "Close files",
                    close: closeDock
                )
                explorerContent
            }
        } else {
            explorerContent
                .navigationTitle("Files · \(workspaceLabel)")
                .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var explorerContent: some View {
        Group {
            switch model.phase {
            case .waiting:
                stateView(title: "Waiting for daemon…", iconID: .wifiSlash, retry: true)
            case .loading:
                YiruLoader(size: Theme.Control.largeIcon)
            case .failed(let failure):
                stateView(
                    title: failure.isConnectionFailure
                        ? "Waiting for daemon…"
                        : LocalizedStringResource(stringLiteral: failure.message),
                    iconID: failure.isConnectionFailure ? .wifiSlash : .warning,
                    retry: true,
                    description: failure.isConnectionFailure
                        ? "Reconnect to browse workspace files."
                        : "Yiru could not load this file tree."
                )
            case .ready where model.rows.isEmpty:
                stateView(
                    title: "No files found",
                    iconID: .folder,
                    description: "This workspace does not contain any visible files."
                )
            case .ready:
                List {
                    ForEach(model.rows) { row in
                        rowView(row)
                            .listRowInsets(EdgeInsets())
                            .listRowSeparator(.hidden)
                            .listRowBackground(Theme.Colors.background)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable { await model.refresh() }
            }
        }
    }

    @ViewBuilder
    private func rowView(_ row: WorkspaceFileRow) -> some View {
        let leftInset = Theme.Spacing.standard * CGFloat(row.depth + 1)
        switch row.state {
        case .loading:
            HStack(spacing: Theme.Spacing.small) {
                Color.clear.frame(width: Theme.Control.inlineIcon)
                YiruLoader(size: Theme.Control.inlineIcon)
                Text("Loading…")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            .padding(.leading, leftInset)
            .padding(.trailing, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
        case .failed(let message):
            HStack(spacing: Theme.Spacing.small) {
                Color.clear.frame(width: Theme.Control.inlineIcon)
                Text(verbatim: message)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.attention)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button("Retry") { Task { await model.retry(row) } }
                    .buttonStyle(.glass)
                    .appButtonContext(.inline)
            }
            .padding(.leading, leftInset)
            .padding(.trailing, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
        case .item:
            fileRow(row, leftInset: leftInset)
        }
    }

    private func fileRow(_ row: WorkspaceFileRow, leftInset: CGFloat) -> some View {
        let isExpanded = model.expanded.contains(row.relativePath)
        let canPreview = WorkspaceFileProjection.canPreview(row)
        return Button {
            if row.kind == .directory {
                Task { await model.toggle(row) }
            } else if canPreview {
                openFile(row.relativePath, row.name)
            }
        } label: {
            HStack(spacing: Theme.Spacing.small) {
                if row.kind == .directory {
                    YiruIcon(isExpanded ? .chevronDown : .chevronRight, size: 16)
                        .frame(width: 16)
                } else {
                    Color.clear.frame(width: 16)
                }
                YiruIcon(iconName(row), size: 16)
                    .frame(width: 16)
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: row.name)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(
                            canPreview || row.kind == .directory
                                ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                        )
                        .lineLimit(1)
                    if row.kind == .binary, !canPreview {
                        Text("Unavailable on mobile")
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(Theme.Colors.mutedForeground)
            .padding(.leading, leftInset)
            .padding(.trailing, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
        .disabled(row.kind == .binary && !canPreview)
        .accessibilityLabel(accessibilityLabel(row, canPreview: canPreview))
    }

    private func stateView(
        title: LocalizedStringResource,
        iconID: YiruIconID,
        retry: Bool = false,
        description: LocalizedStringResource? = nil
    ) -> some View {
        AppUnavailableState(
            title: Text(title),
            iconID: iconID,
            description: description.map { Text($0) }
        ) {
            if retry {
                Button("Retry") { Task { await model.retryRoot() } }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func iconName(_ row: WorkspaceFileRow) -> YiruIconID {
        if row.kind == .directory { return .folder }
        if WorkspaceFileProjection.isMarkdown(row.relativePath) { return .fileText }
        if row.kind == .binary, WorkspaceFileProjection.canPreview(row) { return .photo }
        return .file
    }

    private func accessibilityLabel(_ row: WorkspaceFileRow, canPreview: Bool) -> Text {
        if row.kind == .directory { return Text("Open folder \(row.name)") }
        if !canPreview { return Text("\(row.name) unavailable on mobile") }
        return Text("Preview file \(row.name)")
    }

    // Why: prefer the live name over the WorkspaceSummary snapshot handed to this
    // screen at navigation time — see WorkspaceFileExplorerModel.liveWorktreeDisplayName.
    private var workspaceLabel: String {
        if let liveName = model.liveWorktreeDisplayName, !liveName.isEmpty {
            return liveName
        }
        return workspace.name.isEmpty ? workspace.repoName : workspace.name
    }
}

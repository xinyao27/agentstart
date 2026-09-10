import CoreGraphics
import SwiftUI

struct SourceBranchChanges: View {
    @Bindable var model: SourceControlModel
    let open: (SourceBranchFile) -> Void

    var body: some View {
        if model.isLoadingBranchComparison, model.branchComparison == nil {
            stateRow {
                ProgressView()
                    .controlSize(.small)
                Text("Loading committed changes…")
            }
        } else if let error = model.branchComparisonError, model.branchComparison == nil {
            sectionHeader(title: "Committed on Branch", summary: nil, count: 0)
            stateRow { Text(verbatim: error) }
        } else if let comparison = model.branchComparison {
            sectionHeader(
                title: "Committed on Branch",
                summary: comparison.summary,
                count: comparison.entries.count
            )
            if comparison.status != "ready" {
                stateRow { Text(verbatim: comparison.summary) }
            } else {
                ForEach(comparison.entries) { entry in
                    branchRow(entry, canOpen: comparison.canOpenDiff)
                }
            }
        }
    }

    private func sectionHeader(title: LocalizedStringResource, summary: String?, count: Int)
        -> some View
    {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(title)
                    .textCase(.uppercase)
                if let summary {
                    Text(verbatim: summary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: Theme.Spacing.small)
            // Why: `.formatted()` and plain interpolation both apply locale thousands
            // grouping. These counts sit beside paths and code, where a separator reads as
            // part of an identifier, so they stay ungrouped.
            Text(verbatim: String(count))
        }
        .font(.system(size: Theme.Typography.metadata))
        .foregroundStyle(Theme.Colors.mutedForeground)
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.medium)
        .padding(.bottom, Theme.Spacing.extraSmall)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Theme.Colors.background)
    }

    private func branchRow(_ entry: SourceBranchFile, canOpen: Bool) -> some View {
        Button {
            open(entry)
        } label: {
            HStack(spacing: Theme.Spacing.small) {
                Text(verbatim: entry.status.label)
                    .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                    .foregroundStyle(entry.status.color)
                    .frame(width: Theme.Spacing.large)
                // Why: same rationale as SourceFileRow — the basename identifies the file
                // and must stay visible instead of tail-truncating behind the shared
                // directory prefix.
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text(verbatim: fileName(entry.path))
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(
                            canOpen ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                        )
                        .lineLimit(1)
                    if let directory = directoryPath(entry.path) {
                        Text(verbatim: directory)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                            .truncationMode(.head)
                    }
                    if let detail = entryDetail(entry) {
                        Text(verbatim: detail)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if canOpen {
                    AgentStartIcon(.arrowRight, size: 16)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(width: Theme.Spacing.large)
                }
            }
            .padding(.horizontal, Theme.Spacing.page)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .disabled(!canOpen || model.busyAction != nil)
        .padding(.vertical, Theme.Spacing.small)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .contentShape(.interaction, .rect)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Theme.Colors.background)
    }

    private func stateRow<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: Theme.Spacing.small, content: content)
            .font(.system(size: Theme.Typography.metadata))
            .foregroundStyle(Theme.Colors.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.vertical, Theme.Spacing.standard)
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Theme.Colors.background)
    }

    // Why: git status paths are always "/"-separated regardless of host OS — see the
    // matching helper in SourceFileRow.
    private func fileName(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    private func directoryPath(_ path: String) -> String? {
        guard let slashIndex = path.lastIndex(of: "/") else { return nil }
        return String(path[..<slashIndex])
    }

    private func entryDetail(_ entry: SourceBranchFile) -> String? {
        let stats =
            entry.added != nil || entry.removed != nil
            ? "+\(entry.added ?? 0) −\(entry.removed ?? 0)"
            : nil
        guard let oldPath = entry.oldPath else { return stats }
        return stats.map { String(localized: "from \(oldPath); \($0)") }
            ?? String(localized: "from \(oldPath)")
    }
}

struct SourceBranchDiffView: View {
    let hostID: String
    let worktreeID: String
    let entry: SourceBranchFile
    let comparison: SourceBranchComparison
    let repository: any SourceControlRepository
    @Environment(\.dismiss) private var dismiss
    @State private var phase = SourceBranchDiffPhase.loading

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .loading:
                    ProgressView()
                        .controlSize(.small)
                case .failed(let message):
                    AppUnavailableState(
                        "Unable to Load Diff",
                        iconID: .search,
                        description: Text(verbatim: message)
                    ) {
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.glass)
                            .appButtonContext(.regular)
                    }
                case .ready(let document):
                    documentView(document)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.content)
            .navigationTitle(entry.path)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close diff",
                    action: dismiss.callAsFunction
                )
            }
        }
        .appSheetPresentation(.page)
        .task(id: entry) { await load() }
    }

    @ViewBuilder
    private func documentView(_ document: WorkspaceFileDocument) -> some View {
        switch document {
        case .diff(let lines, let isTruncated):
            WorkspaceDiffPane(lines: lines, isTruncated: isTruncated, filePath: entry.path)
        case .image(let data, _):
            SourceBranchImagePreview(data: data)
        case .text(let content, _, _), .html(let content, _):
            GeometryReader { geometry in
                ScrollView([.horizontal, .vertical]) {
                    Text(verbatim: content)
                        .font(.system(size: Theme.Typography.code, design: .monospaced))
                        .textSelection(.enabled)
                        .padding(Theme.Spacing.standard)
                        .frame(
                            minWidth: geometry.size.width,
                            minHeight: geometry.size.height,
                            alignment: .topLeading
                        )
                }
            }
        }
    }

    private func load() async {
        phase = .loading
        do {
            phase = .ready(
                try await repository.sourceBranchDiff(
                    for: hostID,
                    worktreeID: worktreeID,
                    entry: entry,
                    comparison: comparison
                )
            )
        } catch is CancellationError {
            return
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

private struct SourceBranchImagePreview: View {
    let data: Data
    @State private var image: CGImage?

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            if let image {
                Image(decorative: image, scale: 1, orientation: .up)
                    .resizable()
                    .scaledToFit()
                    .padding(Theme.Spacing.standard)
            } else {
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            let decodedImage = await Task.detached(priority: .userInitiated) {
                PlatformImageDecoder.decode(data)
            }.value
            guard !Task.isCancelled else { return }
            image = decodedImage
        }
    }
}

nonisolated private enum SourceBranchDiffPhase: Sendable {
    case loading
    case ready(WorkspaceFileDocument)
    case failed(String)
}

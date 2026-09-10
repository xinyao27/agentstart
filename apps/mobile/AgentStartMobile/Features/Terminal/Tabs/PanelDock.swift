import SwiftUI

nonisolated enum TerminalSessionPanel: Hashable, Sendable {
    case files
    case sourceControl

    var sourceTab: SourceControlHubTab? {
        switch self {
        case .files: nil
        case .sourceControl: .changes
        }
    }
}

nonisolated enum TerminalPanelDockMetrics {
    static let wideLayoutMinimum: CGFloat = 700
    static let minimumMainWidth: CGFloat = 360
    static let minimumWidth: CGFloat = 280
    static let maximumWidth: CGFloat = 560
    static let defaultWidth: CGFloat = 340
    static let preferenceKey = "agentstart:hostDockWidth"

    static func canDock(
        availableWidth: CGFloat,
        isWideLayout: Bool
    ) -> Bool {
        isWideLayout && availableWidth >= wideLayoutMinimum
    }

    static func clamp(_ width: CGFloat, availableWidth: CGFloat) -> CGFloat {
        let maximumForRow = max(minimumWidth, availableWidth - minimumMainWidth)
        return min(maximumWidth, maximumForRow, max(minimumWidth, width.rounded()))
    }
}

struct TerminalPanelDock: View {
    let panel: TerminalSessionPanel
    let availableWidth: CGFloat
    let host: HostProfile
    let workspace: WorkspaceSummary
    let filesRepository: any WorkspaceFilesRepository
    let connectionRuntime: any HostConnectionRuntime
    let sourceRepository: any SourceControlRepository
    let sourceReviewRepository: any SourceReviewRepository
    let hostedReviewRepository: any HostedReviewRepository
    let close: () -> Void
    let openFile: (String, String) -> Void
    let openReview: (SourceFileEntry) -> Void
    let activeTabIDAtTap: () -> String?
    let activateOpenedDiff: (String, String?) async -> Bool
    @State private var preferredWidth: CGFloat
    @State private var dragStartWidth: CGFloat?
    @State private var openError: String?

    init(
        panel: TerminalSessionPanel,
        availableWidth: CGFloat,
        host: HostProfile,
        workspace: WorkspaceSummary,
        filesRepository: any WorkspaceFilesRepository,
        connectionRuntime: any HostConnectionRuntime,
        sourceRepository: any SourceControlRepository,
        sourceReviewRepository: any SourceReviewRepository,
        hostedReviewRepository: any HostedReviewRepository,
        close: @escaping () -> Void,
        openFile: @escaping (String, String) -> Void,
        openReview: @escaping (SourceFileEntry) -> Void,
        activeTabIDAtTap: @escaping () -> String?,
        activateOpenedDiff: @escaping (String, String?) async -> Bool
    ) {
        self.panel = panel
        self.availableWidth = availableWidth
        self.host = host
        self.workspace = workspace
        self.filesRepository = filesRepository
        self.connectionRuntime = connectionRuntime
        self.sourceRepository = sourceRepository
        self.sourceReviewRepository = sourceReviewRepository
        self.hostedReviewRepository = hostedReviewRepository
        self.close = close
        self.openFile = openFile
        self.openReview = openReview
        self.activeTabIDAtTap = activeTabIDAtTap
        self.activateOpenedDiff = activateOpenedDiff
        let stored =
            UserDefaults.standard.object(
                forKey: TerminalPanelDockMetrics.preferenceKey
            ) as? Double
        _preferredWidth = State(
            initialValue: stored.map { CGFloat($0) } ?? TerminalPanelDockMetrics.defaultWidth
        )
    }

    var body: some View {
        Group {
            if panel == .files {
                WorkspaceFileExplorerView(
                    host: host,
                    workspace: workspace,
                    repository: filesRepository,
                    connectionRuntime: connectionRuntime,
                    closeDock: close,
                    openFile: openFile
                )
            } else {
                SourceControlView(
                    host: host,
                    workspace: workspace,
                    repository: sourceRepository,
                    hostedReviewRepository: hostedReviewRepository,
                    connectionRuntime: connectionRuntime,
                    initialTab: panel.sourceTab ?? .changes,
                    requestedTab: panel.sourceTab,
                    closeDock: close,
                    openReview: openReview,
                    openReviewInSession: openReviewInSession
                )
            }
        }
        .frame(width: dockWidth)
        .frame(maxHeight: .infinity)
        .background(Theme.Colors.background)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Theme.Colors.rail.opacity(0.65))
                .frame(width: 0.5)
        }
        .overlay(alignment: .leading) {
            Color.clear
                .frame(width: 24)
                .contentShape(Rectangle())
                .offset(x: -12)
                .highPriorityGesture(resizeGesture)
                .accessibilityHidden(true)
        }
        .onChange(of: availableWidth) {
            preferredWidth = dockWidth
        }
        .alert(
            "Unable to open diff",
            isPresented: Binding(
                get: { openError != nil },
                set: { if !$0 { openError = nil } }
            )
        ) {
            Button("OK") { openError = nil }
        } message: {
            if let openError { Text(verbatim: openError) }
        }
    }

    private var dockWidth: CGFloat {
        TerminalPanelDockMetrics.clamp(preferredWidth, availableWidth: availableWidth)
    }

    private func openReviewInSession(_ entry: SourceFileEntry) {
        guard entry.canOpen else {
            openReview(entry)
            return
        }
        let scope: SourceReviewScope = entry.area == .staged ? .staged : .unstaged
        let item = SourceReviewItem(
            id: "\(scope.rawValue):\(entry.path)",
            scope: scope,
            area: entry.area.rawValue,
            filePath: entry.path,
            oldPath: entry.oldPath,
            status: entry.status,
            added: entry.added,
            removed: entry.removed,
            canStage: entry.canStage,
            canUnstage: entry.area == .staged,
            canDiscard: entry.area != .staged && entry.canDiscard,
            isGeneratedOrLockFile: false,
            diffIdentity: "",
            noteCount: 0,
            unsentNoteCount: 0,
            staleNoteCount: 0,
            reviewedAt: nil,
            isReviewed: false,
            changedSinceReview: false
        )
        let selectedTabID = activeTabIDAtTap()
        Task {
            do {
                try await sourceReviewRepository.openSourceReviewInSession(
                    for: host.id,
                    worktreeID: workspace.id,
                    item: item
                )
                close()
                // Why: Desktop publishes the new diff tab after the openDiff RPC returns, so
                // activation has to wait on the session snapshot — while still preserving a tab
                // the user selected during that publication window.
                _ = await activateOpenedDiff(entry.path, selectedTabID)
            } catch {
                // Why: keep the embedded dock open when the desktop rejects the session-open
                // request, so a transient RPC failure cannot eject the user into a different
                // review route or hide the action that failed.
                openError = error.localizedDescription
            }
        }
    }

    private var resizeGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let start = dragStartWidth ?? dockWidth
                if dragStartWidth == nil { dragStartWidth = start }
                preferredWidth = TerminalPanelDockMetrics.clamp(
                    start - value.translation.width,
                    availableWidth: availableWidth
                )
            }
            .onEnded { _ in
                let settled = dockWidth
                preferredWidth = settled
                dragStartWidth = nil
                UserDefaults.standard.set(
                    Double(settled),
                    forKey: TerminalPanelDockMetrics.preferenceKey
                )
            }
    }
}

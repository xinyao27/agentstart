import SwiftUI
import UIKit

struct TerminalWorkspaceView: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.agentstartLayoutMetrics) private var layoutMetrics
    let workspace: WorkspaceSummary
    @State private var model: TerminalWorkspaceModel
    @State private var diffCommentsModel: WorkspaceDiffCommentsModel
    @State private var isNewTabPresented = false
    @State private var isQuickCommandsPresented = false
    @State private var hostCapabilities: TerminalHostCapabilities?
    @State private var markdownDrafts: [String: WorkspaceMarkdownDraft] = [:]
    @State private var contentRefreshRevisions: [String: Int] = [:]
    @State private var leaveDrafts: [WorkspaceMarkdownDraft]?
    private let host: HostProfile
    private let contentRepository: any WorkspaceContentRepository
    private let browserRepository: any WorkspaceBrowserRepository
    private let workspaceCreationRepository: any WorkspaceCreationRepository
    private let connectionRuntime: any HostConnectionRuntime
    private let quickCommandRepository: any TerminalQuickCommandRepository
    private let capabilityRepository: any TerminalHostCapabilityRepository
    private let filesRepository: any WorkspaceFilesRepository
    private let sourceRepository: any SourceControlRepository
    private let sourceReviewRepository: any SourceReviewRepository
    private let hostedReviewRepository: any HostedReviewRepository
    private let runtime: any TerminalSessionRuntime
    private let displayModeRuntime: any TerminalDisplayModeRuntime
    private let surfaceFactory: any TerminalSurfaceFactory
    private let preferences: TerminalPreferences
    private let settingsPreferences: SettingsPreferences
    private let showFiles: () -> Void
    private let showSourceControl: () -> Void
    private let showAgentHistory: () -> Void
    private let openTerminalFile: (TerminalFileOpenRequest) -> Void
    private let openWorkspaceFile: (String, String) -> Void
    private let openSourceReview: (SourceFileEntry) -> Void

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        initialTab: WorkspaceOpenTab? = nil,
        repository: any TerminalWorkspaceRepository,
        connectionRuntime: any HostConnectionRuntime,
        contentRepository: any WorkspaceContentRepository,
        browserRepository: any WorkspaceBrowserRepository,
        workspaceCreationRepository: any WorkspaceCreationRepository,
        quickCommandRepository: any TerminalQuickCommandRepository,
        capabilityRepository: any TerminalHostCapabilityRepository,
        filesRepository: any WorkspaceFilesRepository,
        sourceRepository: any SourceControlRepository,
        sourceReviewRepository: any SourceReviewRepository,
        hostedReviewRepository: any HostedReviewRepository,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        preferences: TerminalPreferences,
        settingsPreferences: SettingsPreferences,
        showFiles: @escaping () -> Void,
        showSourceControl: @escaping () -> Void,
        showAgentHistory: @escaping () -> Void,
        openTerminalFile: @escaping (TerminalFileOpenRequest) -> Void,
        openWorkspaceFile: @escaping (String, String) -> Void,
        openSourceReview: @escaping (SourceFileEntry) -> Void
    ) {
        self.host = host
        self.contentRepository = contentRepository
        self.browserRepository = browserRepository
        self.workspaceCreationRepository = workspaceCreationRepository
        self.connectionRuntime = connectionRuntime
        self.quickCommandRepository = quickCommandRepository
        self.capabilityRepository = capabilityRepository
        self.filesRepository = filesRepository
        self.sourceRepository = sourceRepository
        self.sourceReviewRepository = sourceReviewRepository
        self.hostedReviewRepository = hostedReviewRepository
        self.workspace = workspace
        self.runtime = runtime
        self.displayModeRuntime = displayModeRuntime
        self.surfaceFactory = surfaceFactory
        self.preferences = preferences
        self.settingsPreferences = settingsPreferences
        self.showFiles = showFiles
        self.showSourceControl = showSourceControl
        self.showAgentHistory = showAgentHistory
        self.openTerminalFile = openTerminalFile
        self.openWorkspaceFile = openWorkspaceFile
        self.openSourceReview = openSourceReview
        _model = State(
            initialValue: TerminalWorkspaceModel(
                hostID: host.id,
                worktreeID: workspace.id,
                repoID: workspace.repoID,
                displayName: workspace.name,
                initialTabID: initialTab?.id,
                repository: repository,
                connectionRuntime: connectionRuntime,
                quickCommandRepository: quickCommandRepository
            )
        )
        _diffCommentsModel = State(
            initialValue: WorkspaceDiffCommentsModel(
                hostID: host.id,
                worktreeID: workspace.id,
                repository: sourceReviewRepository
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                HStack(spacing: Theme.Spacing.small) {
                    AgentStartLoader(size: Theme.Control.largeIcon)
                    Text("Loading workspace session…")
                        .font(.system(size: Theme.Typography.supporting))
                }
            case .loaded:
                TerminalWorkspaceContentView(
                    host: host,
                    workspace: workspace,
                    model: model,
                    diffCommentsModel: diffCommentsModel,
                    hostCapabilities: hostCapabilities,
                    contentRepository: contentRepository,
                    browserRepository: browserRepository,
                    filesRepository: filesRepository,
                    sourceRepository: sourceRepository,
                    sourceReviewRepository: sourceReviewRepository,
                    hostedReviewRepository: hostedReviewRepository,
                    runtime: runtime,
                    displayModeRuntime: displayModeRuntime,
                    surfaceFactory: surfaceFactory,
                    preferences: preferences,
                    settingsPreferences: settingsPreferences,
                    showFiles: showFiles,
                    showSourceControl: showSourceControl,
                    showAgentHistory: showAgentHistory,
                    showQuickCommands: { isQuickCommandsPresented = true },
                    createTerminalTab: { isNewTabPresented = true },
                    openTerminalFile: openTerminalFile,
                    openWorkspaceFile: openWorkspaceFile,
                    openSourceReview: openSourceReview,
                    openTerminalURL: openTerminalURL,
                    updateDraft: updateDraft,
                    refreshContent: requestContentRefresh,
                    copyContentPath: copyContentPath,
                    contentRefreshID: { contentRefreshRevisions[$0] ?? 0 }
                )
            case .failed(let message):
                AppUnavailableState(
                    "Workspace session unavailable",
                    iconID: .stack,
                    description: Text(message)
                ) {
                    Button("Try again") {
                        Task { await model.reconnectAndLoad() }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        // Why: a single-line native title only. The explicit principal toolbar item below is
        // what preserves middle truncation without SwiftUI's default large-title layout.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .disablesInteractivePopGesture(!markdownDrafts.isEmpty)
        .task {
            await model.observe()
        }
        .task(id: model.isConnected) {
            guard model.isConnected else { return }
            await diffCommentsModel.load()
        }
        .alert(
            "Tab action failed",
            isPresented: Binding(
                get: { model.mutationError != nil },
                set: { if !$0 { model.dismissMutationError() } }
            )
        ) {
            Button("OK", action: model.dismissMutationError)
        } message: {
            if let message = model.mutationError {
                Text(message)
            }
        }
        .sheet(isPresented: $isNewTabPresented) {
            WorkspaceNewTabChooser(
                hostID: host.id,
                repoID: workspace.repoID,
                repository: workspaceCreationRepository,
                createAgent: { agentID in
                    Task { await model.createTerminal(agentID: agentID) }
                },
                createTerminal: { Task { await model.createTerminal() } },
                createMarkdown: { Task { await model.createMarkdown() } },
                createBrowser: { url in Task { await model.createBrowser(url: url) } },
                browserSupported: hostCapabilities?.browserScreencastSupported == true,
                browserUnavailable: model.reportBrowserUnavailable
            )
        }
        .sheet(isPresented: $isQuickCommandsPresented) {
            TerminalQuickCommandSheet(
                hostID: host.id,
                repoID: workspace.kind == .git ? workspace.repoID : nil,
                repoName: workspace.kind == .git ? workspace.repoName : nil,
                repository: quickCommandRepository,
                launch: model.launchQuickCommand
            )
        }
        .task(id: model.isConnected) {
            guard model.isConnected else {
                hostCapabilities = nil
                return
            }
            hostCapabilities = await capabilityRepository.terminalCapabilities(for: host.id)
            if hostCapabilities?.quickCommandsSupported == false {
                isQuickCommandsPresented = false
            }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                TerminalSessionHeader(title: model.displayName)
            }
            ToolbarItem(placement: .topBarLeading) {
                Button(action: requestLeaveSession) {
                    AgentStartToolbarIcon(.arrowLeft)
                }
                .accessibilityLabel("Back to workspaces")
            }
            if model.activeTab?.terminalTarget == nil, case .loaded = model.phase {
                ToolbarItem(placement: .topBarTrailing) {
                    TerminalWorkspaceMenu(
                        workspace: workspace,
                        quickCommandsAvailable: quickCommandsAvailable,
                        agentHistoryAvailable: agentHistoryAvailable,
                        showQuickCommands: { isQuickCommandsPresented = true },
                        showFiles: showFiles,
                        showSourceControl: showSourceControl,
                        showAgentHistory: showAgentHistory
                    )
                }
            }
        }
        .confirmationDialog(
            "Unsaved markdown changes",
            isPresented: Binding(
                get: { leaveDrafts != nil },
                set: { if !$0 { leaveDrafts = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Copy All & Leave") { copyDraftsAndLeave() }
            Button("Discard & Leave", role: .destructive) { leaveSession() }
            Button("Cancel", role: .cancel) { leaveDrafts = nil }
        } message: {
            Text("Copy or discard phone drafts before leaving.")
        }
    }

    private func openTerminalURL(_ url: URL) {
        if settingsPreferences.terminalLinkOpenMode == .phoneBrowser {
            openURL(url)
        } else if hostCapabilities?.browserScreencastSupported == true {
            Task { await model.createBrowser(url: url.absoluteString) }
        } else {
            model.reportBrowserUnavailable()
        }
    }

    private var quickCommandsAvailable: Bool {
        hostCapabilities?.quickCommandsSupported != false
    }

    private var agentHistoryAvailable: Bool {
        hostCapabilities?.agentHistorySupported == true
    }

    private func updateDraft(_ draft: WorkspaceMarkdownDraft?, for tabID: String) {
        if let draft {
            markdownDrafts[tabID] = draft
        } else {
            markdownDrafts.removeValue(forKey: tabID)
        }
    }

    private func requestContentRefresh(for tab: TerminalWorkspaceTab) {
        contentRefreshRevisions[tab.id, default: 0] += 1
    }

    private func copyContentPath(for tab: TerminalWorkspaceTab) {
        guard case .markdown(let descriptor) = tab.content else { return }
        UIPasteboard.general.string = descriptor.relativePath
    }

    private func requestLeaveSession() {
        let drafts = markdownDrafts.values.sorted { $0.title < $1.title }
        guard !drafts.isEmpty else {
            dismiss()
            return
        }
        leaveDrafts = drafts
    }

    private func copyDraftsAndLeave() {
        guard let leaveDrafts else { return }
        UIPasteboard.general.string = leaveDrafts.map { draft in
            "# \(draft.title)\n\n\(draft.content)"
        }.joined(separator: "\n\n---\n\n")
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        leaveSession()
    }

    private func leaveSession() {
        leaveDrafts = nil
        markdownDrafts.removeAll()
        dismiss()
    }
}

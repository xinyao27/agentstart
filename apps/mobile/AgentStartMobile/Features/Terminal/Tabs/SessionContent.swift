import SwiftUI
import UIKit

struct TerminalWorkspaceContentView: View {
    @Environment(\.agentstartLayoutMetrics) private var layoutMetrics
    let host: HostProfile
    let workspace: WorkspaceSummary
    let model: TerminalWorkspaceModel
    let diffCommentsModel: WorkspaceDiffCommentsModel
    let hostCapabilities: TerminalHostCapabilities?
    let contentRepository: any WorkspaceContentRepository
    let browserRepository: any WorkspaceBrowserRepository
    let filesRepository: any WorkspaceFilesRepository
    let sourceRepository: any SourceControlRepository
    let sourceReviewRepository: any SourceReviewRepository
    let hostedReviewRepository: any HostedReviewRepository
    let runtime: any TerminalSessionRuntime
    let displayModeRuntime: any TerminalDisplayModeRuntime
    let surfaceFactory: any TerminalSurfaceFactory
    let preferences: TerminalPreferences
    let settingsPreferences: SettingsPreferences
    let showFiles: () -> Void
    let showSourceControl: () -> Void
    let showAgentHistory: () -> Void
    let showQuickCommands: () -> Void
    let createTerminalTab: () -> Void
    let openTerminalFile: (TerminalFileOpenRequest) -> Void
    let openWorkspaceFile: (String, String) -> Void
    let openSourceReview: (SourceFileEntry) -> Void
    let openTerminalURL: (URL) -> Void
    let updateDraft: (WorkspaceMarkdownDraft?, String) -> Void
    let refreshContent: (TerminalWorkspaceTab) -> Void
    let copyContentPath: (TerminalWorkspaceTab) -> Void
    let contentRefreshID: (String) -> Int

    @State private var activePanel: TerminalSessionPanel?
    @State private var sessionContentWidth: CGFloat = 0
    @State private var isPendingTerminalNoticeDismissed = false

    var body: some View {
        HStack(spacing: 0) {
            primaryWorkspaceContent
                .frame(minWidth: 0, maxWidth: .infinity, maxHeight: .infinity)
            if canDockPanel, let activePanel {
                TerminalPanelDock(
                    panel: activePanel,
                    availableWidth: sessionContentWidth,
                    host: host,
                    workspace: workspace,
                    filesRepository: filesRepository,
                    connectionRuntime: model.connectionRuntime,
                    sourceRepository: sourceRepository,
                    sourceReviewRepository: sourceReviewRepository,
                    hostedReviewRepository: hostedReviewRepository,
                    close: { self.activePanel = nil },
                    openFile: openWorkspaceFile,
                    openReview: openSourceReview,
                    activeTabIDAtTap: { model.activeTabID },
                    activateOpenedDiff: { path, activeTabID in
                        await model.activateOpenedDiff(
                            relativePath: path,
                            activeTabIDAtTap: activeTabID
                        )
                    }
                )
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.width
        } action: { width in
            sessionContentWidth = width
            if !TerminalPanelDockMetrics.canDock(
                availableWidth: width,
                isWideLayout: layoutMetrics.isWideLayout
            ) {
                activePanel = nil
            }
        }
        .animation(Theme.Motion.stateChange, value: activePanel)
        .overlay(alignment: .top) {
            if let pendingActiveTab, !isPendingTerminalNoticeDismissed {
                PendingTerminalNotice(
                    didTimeOut: model.isPendingTerminalTimedOut(pendingActiveTab.id),
                    retry: {
                        isPendingTerminalNoticeDismissed = true
                        Task { await model.retryPendingTerminal(pendingActiveTab) }
                    },
                    dismiss: {
                        withAnimation(Theme.Motion.stateChange) {
                            isPendingTerminalNoticeDismissed = true
                        }
                    }
                )
                .padding(.horizontal, TerminalChromeMetrics.horizontalInset)
                .padding(.top, pendingTerminalNoticeTopPadding)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .onChange(of: pendingActiveTerminalID) { _, _ in
            isPendingTerminalNoticeDismissed = false
        }
    }

    @ViewBuilder
    private var primaryWorkspaceContent: some View {
        if model.tabs.isEmpty {
            AppUnavailableState(
                "No open tabs",
                iconID: .closeCircle,
                description: Text("Create a terminal to start working in this workspace.")
            ) {
                Button("New Terminal", iconID: .add) {
                    Task { await model.createTerminal() }
                }
                .appProminentGlassButton()
                .appButtonContext(.regular)
                .disabled(model.operation != nil)
            }
        } else if model.activeTab?.terminalTarget != nil {
            ZStack {
                retainedTerminals
                retainedNonterminalContent
            }
        } else {
            VStack(spacing: 0) {
                tabStrip
                ZStack {
                    retainedTerminals
                    retainedNonterminalContent
                }
            }
        }
    }

    private var retainedTerminals: some View {
        ZStack {
            ForEach(model.retainedTerminalTabs) { tab in
                if let target = tab.terminalTarget {
                    RetainedTerminalPane(
                        host: host,
                        worktreeID: workspace.id,
                        target: target,
                        runtime: runtime,
                        displayModeRuntime: displayModeRuntime,
                        surfaceFactory: surfaceFactory,
                        preferences: preferences,
                        hostConnectionIsReady: model.isConnected,
                        isVisible: tab.id == model.activeTabID,
                        topChrome: tabStrip,
                        activateSelection: {
                            Task { await model.activateReadyTerminal(tab.id) }
                        },
                        closeTerminal: { Task { await model.close(tab) } },
                        showQuickCommands: quickCommandsAvailable ? showQuickCommands : nil,
                        showFiles: { requestPanel(.files) },
                        showSourceControl: workspace.kind == .git
                            ? { requestPanel(.sourceControl) } : nil,
                        showAgentHistory: workspace.kind == .git && agentHistoryAvailable
                            ? showAgentHistory : nil,
                        openTerminalFile: openTerminalFile,
                        openTerminalURL: openTerminalURL
                    )
                    // Why: Desktop can replace a disconnected renderer mirror with the
                    // recovered PTY handle without changing the tab identity. Recreate the
                    // stateful live model for that new target instead of keeping a session
                    // permanently bound to the stale handle.
                    .id("\(tab.id):\(target.id)")
                    .opacity(tab.id == model.activeTabID ? 1 : 0)
                    .allowsHitTesting(tab.id == model.activeTabID)
                    .accessibilityHidden(tab.id != model.activeTabID)
                }
            }
        }
    }

    private var retainedNonterminalContent: some View {
        ZStack {
            ForEach(model.retainedNonterminalTabs) { tab in
                nonterminalContent(tab)
                    .id(tab.id)
                    .opacity(tab.id == model.activeTabID ? 1 : 0)
                    .allowsHitTesting(tab.id == model.activeTabID)
                    .accessibilityHidden(tab.id != model.activeTabID)
            }
        }
    }

    @ViewBuilder
    private func nonterminalContent(_ tab: TerminalWorkspaceTab) -> some View {
        switch tab.content {
        case .terminal(.ready):
            EmptyView()
        case .terminal(.sleeping):
            AppUnavailableState(
                "Terminal is sleeping",
                iconID: .moon,
                description: Text("Resume this workspace to reconnect its terminals.")
            ) {
                Button("Resume Workspace", iconID: .play) {
                    Task { await model.resumeWorkspace() }
                }
                .appProminentGlassButton()
                .appButtonContext(.regular)
                .disabled(!model.isConnected || model.operation != nil)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.background)
        case .terminal(.pending):
            if model.isPendingTerminalTimedOut(tab.id) {
                AppUnavailableState(
                    "Couldn't start terminal",
                    iconID: .warning,
                    description: Text("The host did not respond. Try again.")
                ) {
                    Button("Retry", iconID: .refresh) {
                        Task { await model.retryPendingTerminal(tab) }
                    }
                    .appProminentGlassButton()
                    .appButtonContext(.regular)
                    .disabled(model.operation != nil)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.Colors.background)
            } else {
                VStack(spacing: Theme.Spacing.small) {
                    AgentStartLoader(size: Theme.Control.inlineIcon)
                    Text(tab.displayTitle.isEmpty ? "Loading terminal" : tab.displayTitle)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.Colors.background)
            }
        case .markdown(let descriptor):
            WorkspaceMarkdownPane(
                hostID: host.id,
                worktreeID: workspace.id,
                tab: tab,
                descriptor: descriptor,
                repository: contentRepository,
                refreshID: contentRefreshID(tab.id),
                draftChanged: { updateDraft($0, tab.id) }
            )
        case .file(let descriptor):
            WorkspaceFilePane(
                hostID: host.id,
                worktreeID: workspace.id,
                title: tab.title,
                descriptor: descriptor,
                refreshID: contentRefreshID(tab.id),
                repository: contentRepository,
                connectionRuntime: model.connectionRuntime,
                commentsModel: diffCommentsModel
            )
        case .browser(let descriptor):
            WorkspaceBrowserPane(
                hostID: host.id,
                worktreeID: workspace.id,
                descriptor: descriptor,
                isVisible: tab.id == model.activeTabID,
                repository: browserRepository,
                browserSupported: hostCapabilities?.browserScreencastSupported,
                connectionReady: model.isConnected
            )
        }
    }

    private var tabStrip: TerminalTabStrip {
        TerminalTabStrip(
            tabs: model.tabs,
            activeTabID: model.activeTabID,
            isDisabled: model.operation != nil,
            selectTab: { tab in Task { await model.select(tab) } },
            closeTab: { tab in Task { await model.close(tab) } },
            navigateBrowser: navigateBrowser,
            createTerminal: createTerminalTab,
            contentContextActions: TerminalContentContextActions(
                refresh: refreshContent,
                copyPath: copyContentPath
            )
        )
    }

    private var quickCommandsAvailable: Bool {
        hostCapabilities?.quickCommandsSupported != false
    }

    private var agentHistoryAvailable: Bool {
        hostCapabilities?.agentHistorySupported == true
    }

    private var pendingActiveTab: TerminalWorkspaceTab? {
        guard let activeTab = model.activeTab, activeTab.isPendingTerminal else { return nil }
        return activeTab
    }

    private var pendingActiveTerminalID: String? {
        pendingActiveTab?.id
    }

    private var pendingTerminalNoticeTopPadding: CGFloat {
        model.activeTab?.terminalTarget == nil
            ? TerminalChromeMetrics.tabStripHeight + Theme.Spacing.small
            : Theme.Spacing.small
    }

    private var canDockPanel: Bool {
        TerminalPanelDockMetrics.canDock(
            availableWidth: sessionContentWidth,
            isWideLayout: layoutMetrics.isWideLayout
        )
    }

    private func requestPanel(_ panel: TerminalSessionPanel) {
        guard canDockPanel else {
            switch panel {
            case .files: showFiles()
            case .sourceControl: showSourceControl()
            }
            return
        }
        activePanel = activePanel == panel ? nil : panel
    }

    private func navigateBrowser(
        _ tab: TerminalWorkspaceTab,
        action: WorkspaceBrowserNavigation
    ) {
        guard case .browser(let browser) = tab.content, let pageID = browser.pageID else { return }
        Task {
            _ = try? await browserRepository.navigateBrowser(
                for: host.id,
                worktreeID: workspace.id,
                pageID: pageID,
                action: action
            )
            await model.refreshTabs()
        }
    }
}

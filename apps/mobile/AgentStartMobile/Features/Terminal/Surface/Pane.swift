import SwiftUI

struct TerminalLivePane: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var model: TerminalLiveModel
    let preferences: TerminalPreferences
    var hostConnectionIsReady = true
    let isVisible: Bool
    let topChrome: TerminalTabStrip?
    let closeTerminal: (() -> Void)?
    var showQuickCommands: (() -> Void)? = nil
    let showFiles: (() -> Void)?
    let showSourceControl: (() -> Void)?
    let showAgentHistory: (() -> Void)?
    var openTerminalFile: ((TerminalTappedFile) -> Void)? = nil
    var openTerminalURL: ((URL) -> Void)? = nil

    var body: some View {
        VStack(spacing: 0) {
            if let topChrome {
                topChrome
            }

            TerminalSurfaceHost(surface: model.surface)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, TerminalChromeMetrics.horizontalInset)
                .background(Theme.Colors.background)
                .clipped()
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    TerminalAccessoryDock(
                        state: model.surface.accessoryState,
                        displayMode: model.displayMode,
                        isDisplayModeUpdating: model.isDisplayModeUpdating,
                        toggleDisplayMode: { Task { await model.toggleDisplayMode() } },
                        removeCustomKey: { preferences.removeCustomKey($0) }
                    )
                }
        }
        .background(Theme.Colors.background)
        .overlay(alignment: .top) {
            TerminalConnectionStatusBanner(
                model: model,
                hostConnectionIsReady: hostConnectionIsReady
            )
            .padding(.horizontal, TerminalChromeMetrics.horizontalInset)
            .padding(.top, Theme.Spacing.small)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
        .overlay(alignment: .bottom) {
            if let notice = model.actionNotice {
                TerminalActionNoticeLabel(message: notice.message)
                    .padding(.bottom, 60)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .toolbar {
            if isVisible {
                ToolbarItem(placement: .topBarTrailing) {
                    controlsMenu
                }
            }
        }
        .task(id: model.connectionAttempt) {
            await model.connect(attempt: model.connectionAttempt)
        }
        .onChange(of: model.linkRequest) { _, request in
            guard isVisible, let request else { return }
            if let url = URL(string: request.rawValue),
                let scheme = url.scheme?.lowercased(),
                ["http", "https"].contains(scheme)
            {
                if let openTerminalURL {
                    openTerminalURL(url)
                } else {
                    openURL(url)
                }
            } else if var tappedFile = TerminalTappedFile.parse(request.rawValue) {
                let parameterLine = request.parameters["line"].flatMap(Int.init)
                let parameterColumn = request.parameters["column"].flatMap(Int.init)
                if parameterLine != nil || parameterColumn != nil {
                    tappedFile = TerminalTappedFile(
                        pathText: tappedFile.pathText,
                        line: parameterLine ?? tappedFile.line,
                        column: parameterColumn ?? tappedFile.column
                    )
                }
                openTerminalFile?(tappedFile)
            }
            model.clearLinkRequest()
        }
        .task(id: scenePhase) {
            await synchronizeDeliveryState()
        }
        .task(id: isVisible) {
            await synchronizeDeliveryState()
        }
        .sensoryFeedback(.warning, trigger: model.bellRevision)
        .onChange(of: preferences.surfaceConfiguration) { _, configuration in
            model.apply(configuration)
        }
    }

    private var controlsMenu: some View {
        Menu {
            if let showQuickCommands {
                Button(action: showQuickCommands) {
                    Label("Quick commands", iconID: .arrowRight)
                }
            }

            if let showFiles {
                Button(action: showFiles) {
                    Label("Open file explorer", iconID: .folder)
                }
            }

            if let showSourceControl {
                Button(action: showSourceControl) {
                    Label("Open source control", iconID: .gitBranch)
                }
            }

            if let showAgentHistory {
                Button(action: showAgentHistory) {
                    Label("Agent History", iconID: .history)
                }
            }

        } label: {
            AgentStartToolbarIcon(.more)
        }
        .accessibilityLabel("More session actions")
    }

    private func synchronizeDeliveryState() async {
        let state: TerminalSessionAppState =
            scenePhase == .active && isVisible
            ? .foreground
            : .background
        await model.setAppState(state)
    }
}

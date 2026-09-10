import SwiftUI

private struct RetainedTerminalPaneState: View {
    @State private var terminal: TerminalLiveModel
    @State private var isRenamePresented = false
    let host: HostProfile
    let worktreeID: String
    let target: TerminalTarget
    let preferences: TerminalPreferences
    let hostConnectionIsReady: Bool
    let isVisible: Bool
    let topChrome: TerminalTabStrip?
    let activateSelection: () -> Void
    let closeTerminal: () -> Void
    let showQuickCommands: (() -> Void)?
    let showFiles: (() -> Void)?
    let showSourceControl: (() -> Void)?
    let showAgentHistory: (() -> Void)?
    let openTerminalFile: (TerminalFileOpenRequest) -> Void
    let openTerminalURL: (URL) -> Void

    init(
        host: HostProfile,
        worktreeID: String,
        target: TerminalTarget,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        preferences: TerminalPreferences,
        hostConnectionIsReady: Bool,
        isVisible: Bool,
        topChrome: TerminalTabStrip?,
        activateSelection: @escaping () -> Void,
        closeTerminal: @escaping () -> Void,
        showQuickCommands: (() -> Void)?,
        showFiles: (() -> Void)?,
        showSourceControl: (() -> Void)?,
        showAgentHistory: (() -> Void)?,
        openTerminalFile: @escaping (TerminalFileOpenRequest) -> Void,
        openTerminalURL: @escaping (URL) -> Void
    ) {
        _terminal = State(
            initialValue: TerminalLiveModel(
                host: host,
                terminal: target,
                runtime: runtime,
                displayModeRuntime: displayModeRuntime,
                surfaceFactory: surfaceFactory,
                surfaceConfiguration: preferences.surfaceConfiguration
            )
        )
        self.host = host
        self.worktreeID = worktreeID
        self.target = target
        self.preferences = preferences
        self.hostConnectionIsReady = hostConnectionIsReady
        self.isVisible = isVisible
        self.topChrome = topChrome
        self.activateSelection = activateSelection
        self.closeTerminal = closeTerminal
        self.showQuickCommands = showQuickCommands
        self.showFiles = showFiles
        self.showSourceControl = showSourceControl
        self.showAgentHistory = showAgentHistory
        self.openTerminalFile = openTerminalFile
        self.openTerminalURL = openTerminalURL
    }

    var body: some View {
        TerminalLivePane(
            model: terminal,
            preferences: preferences,
            hostConnectionIsReady: hostConnectionIsReady,
            isVisible: isVisible,
            topChrome: topChrome,
            closeTerminal: closeTerminal,
            showQuickCommands: showQuickCommands,
            showFiles: showFiles,
            showSourceControl: showSourceControl,
            showAgentHistory: showAgentHistory,
            openTerminalFile: openTappedFile,
            openTerminalURL: openTerminalURL
        )
        .onChange(of: terminal.hasSubscribed, initial: true) { _, _ in
            activateSelectionIfReady()
        }
        .onChange(of: isVisible, initial: true) { _, _ in
            activateSelectionIfReady()
        }
        .environment(\.terminalTabContextActions, terminalTabContextActions)
        .sheet(isPresented: $isRenamePresented) {
            TerminalRenameSheet(title: terminal.title) { title in
                Task { await terminal.rename(title) }
            }
        }
    }

    private func activateSelectionIfReady() {
        guard isVisible, terminal.hasSubscribed else { return }
        activateSelection()
    }

    private var terminalTabContextActions: TerminalTabContextActions {
        TerminalTabContextActions(
            displayMode: terminal.displayMode,
            isDisplayModeUpdating: terminal.isDisplayModeUpdating,
            toggleDisplayMode: { Task { await terminal.toggleDisplayMode() } },
            rename: { isRenamePresented = true },
            clear: { Task { await terminal.clear() } },
            close: closeTerminal
        )
    }

    private func openTappedFile(_ tappedFile: TerminalTappedFile) {
        openTerminalFile(
            TerminalFileOpenRequest(
                hostID: host.id,
                worktreeID: worktreeID,
                terminalID: target.id,
                cwd: terminal.currentDirectory,
                tappedFile: tappedFile
            )
        )
    }
}

struct RetainedTerminalPane: View {
    let host: HostProfile
    let worktreeID: String
    let target: TerminalTarget
    let runtime: any TerminalSessionRuntime
    let displayModeRuntime: any TerminalDisplayModeRuntime
    let surfaceFactory: any TerminalSurfaceFactory
    let preferences: TerminalPreferences
    let hostConnectionIsReady: Bool
    let isVisible: Bool
    let topChrome: TerminalTabStrip?
    let activateSelection: () -> Void
    let closeTerminal: () -> Void
    let showQuickCommands: (() -> Void)?
    let showFiles: (() -> Void)?
    let showSourceControl: (() -> Void)?
    let showAgentHistory: (() -> Void)?
    let openTerminalFile: (TerminalFileOpenRequest) -> Void
    let openTerminalURL: (URL) -> Void

    var body: some View {
        RetainedTerminalPaneState(
            host: host,
            worktreeID: worktreeID,
            target: target,
            runtime: runtime,
            displayModeRuntime: displayModeRuntime,
            surfaceFactory: surfaceFactory,
            preferences: preferences,
            hostConnectionIsReady: hostConnectionIsReady,
            isVisible: isVisible,
            topChrome: topChrome,
            activateSelection: activateSelection,
            closeTerminal: closeTerminal,
            showQuickCommands: showQuickCommands,
            showFiles: showFiles,
            showSourceControl: showSourceControl,
            showAgentHistory: showAgentHistory,
            openTerminalFile: openTerminalFile,
            openTerminalURL: openTerminalURL
        )
    }
}

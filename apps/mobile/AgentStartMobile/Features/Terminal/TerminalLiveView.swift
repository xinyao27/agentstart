import SwiftUI

struct TerminalLiveView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: TerminalLiveModel
    private let preferences: TerminalPreferences
    private let openTerminalFile: ((TerminalFileOpenRequest) -> Void)?
    private let hostID: String
    private let worktreeID: String?
    private let terminalID: String

    init(
        host: HostProfile,
        terminal: TerminalTarget,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        preferences: TerminalPreferences,
        worktreeID: String? = nil,
        openTerminalFile: ((TerminalFileOpenRequest) -> Void)? = nil
    ) {
        _model = State(
            initialValue: TerminalLiveModel(
                host: host,
                terminal: terminal,
                runtime: runtime,
                displayModeRuntime: displayModeRuntime,
                surfaceFactory: surfaceFactory,
                surfaceConfiguration: preferences.surfaceConfiguration
            )
        )
        self.preferences = preferences
        self.openTerminalFile = openTerminalFile
        hostID = host.id
        self.worktreeID = worktreeID
        terminalID = terminal.id
    }

    var body: some View {
        TerminalLivePane(
            model: model,
            preferences: preferences,
            isVisible: true,
            topChrome: nil,
            closeTerminal: {
                Task {
                    guard await model.closeRemote() else { return }
                    dismiss()
                }
            },
            showFiles: nil,
            showSourceControl: nil,
            showAgentHistory: nil,
            openTerminalFile: { tappedFile in
                guard let worktreeID else { return }
                openTerminalFile?(
                    TerminalFileOpenRequest(
                        hostID: hostID,
                        worktreeID: worktreeID,
                        terminalID: terminalID,
                        cwd: model.currentDirectory,
                        tappedFile: tappedFile
                    )
                )
            }
        )
        .navigationTitle(Text(model.title))
        .navigationBarTitleDisplayMode(.inline)
    }
}

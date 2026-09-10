nonisolated protocol TerminalDisplayModeRuntime: Sendable {
    func setTerminalDisplayMode(
        hostID: String,
        terminalID: String,
        mode: TerminalDisplayMode,
        viewport: TerminalGridSize?
    ) async throws -> TerminalDisplayMode
}

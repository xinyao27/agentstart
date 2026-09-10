nonisolated struct TerminalHostCapabilities: Sendable {
    let browserScreencastSupported: Bool
    let agentHistorySupported: Bool
    let quickCommandsSupported: Bool
}

nonisolated protocol TerminalHostCapabilityRepository: Sendable {
    func terminalCapabilities(for hostID: String) async -> TerminalHostCapabilities
}

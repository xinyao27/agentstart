import Foundation

nonisolated struct TerminalOutputChunk: Equatable, Sendable {
    let bytes: Data
    let endSequence: UInt64
}

nonisolated enum TerminalSessionEvent: Equatable, Sendable {
    case subscribed
    case displayMode(TerminalDisplayMode)
    case gridSizeChanged(TerminalGridSize)
    case snapshot(TerminalReplaySnapshot)
    case output(TerminalOutputChunk)
    case clearBuffer
    case ended
}

nonisolated enum TerminalSessionAppState: Equatable, Sendable {
    case foreground
    case background
}

nonisolated enum TerminalInputDeliveryOutcome: Sendable {
    case accepted
    case rejected
    case unknown
}

nonisolated struct TerminalAgentInterruptBaseline: Hashable, Sendable {
    let paneKey: String
    let updatedAt: Double
    let stateStartedAt: Double
    let prompt: String
    let agentType: String?
}

nonisolated protocol TerminalSession: Sendable {
    func events() async -> AsyncThrowingStream<TerminalSessionEvent, Error>
    func sendInput(_ data: Data) async throws
    func sendInputConfirmed(_ data: Data) async throws
    func sendQueryReply(_ data: Data) async throws
    func resize(_ size: TerminalGridSize) async throws
    func acknowledgeOutput(endSequence: UInt64, receiverQueueBytes: UInt32) async throws
    func acknowledgeSnapshot(id: UInt32) async throws
    func setAppState(_ state: TerminalSessionAppState) async
    func close() async
}

nonisolated protocol TerminalSessionRuntime: Sendable {
    func openTerminalSession(
        hostID: String,
        terminalID: String,
        viewport: TerminalGridSize?
    ) async throws
        -> any TerminalSession
    func inferAgentInterrupt(
        hostID: String,
        baseline: TerminalAgentInterruptBaseline
    ) async -> Bool
    func renameTerminal(hostID: String, terminalID: String, title: String) async throws -> String
    func clearTerminal(hostID: String, terminalID: String) async throws
    func closeTerminal(hostID: String, terminalID: String) async throws
}

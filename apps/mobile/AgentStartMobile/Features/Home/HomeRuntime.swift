nonisolated protocol HomeRuntime: Sendable {
    func currentConnectionState() async -> RuntimeConnectionState
    func connectionStates() async -> AsyncStream<RuntimeConnectionState>
    func reconnectMostRecentHost() async
}

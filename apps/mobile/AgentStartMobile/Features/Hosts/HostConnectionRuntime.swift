nonisolated protocol HostConnectionRuntime: Sendable {
    func connectionSnapshots(forHostIDs hostIDs: [String]) async -> AsyncStream<
        [String: RuntimeConnectionSnapshot]
    >
    func reconnect(hostID: String) async
    func disconnect(hostID: String) async
}

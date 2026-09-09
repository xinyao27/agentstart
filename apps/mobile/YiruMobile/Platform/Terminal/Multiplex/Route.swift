import Foundation

nonisolated enum TerminalBulkRouteEvent: Sendable {
    case accepted
    case frame(TerminalMultiplexFrame)
}

nonisolated struct TerminalBulkRoute: Sendable {
    let id: UInt32

    private let bulk: TerminalBulkConnection
    private let stream: AsyncThrowingStream<TerminalBulkRouteEvent, Error>

    init(
        id: UInt32,
        bulk: TerminalBulkConnection,
        stream: AsyncThrowingStream<TerminalBulkRouteEvent, Error>
    ) {
        self.id = id
        self.bulk = bulk
        self.stream = stream
    }

    func events() -> AsyncThrowingStream<TerminalBulkRouteEvent, Error> {
        stream
    }

    func send(
        opcode: TerminalMultiplexOpcodeWire,
        sequence: UInt64 = 0,
        correlationID: UInt32 = 0,
        payload: Data = Data()
    ) async throws {
        try await bulk.send(
            TerminalMultiplexFrame(
                opcode: opcode,
                routeID: id,
                epoch: 0,
                sequence: sequence,
                correlationID: correlationID,
                payload: payload
            )
        )
    }

    func allocateCorrelationID() async throws -> UInt32 {
        try await bulk.allocateCorrelationID()
    }

    func setAppState(_ state: TerminalMultiplexAppState) async {
        await bulk.setAppState(state, routeID: id)
    }

    func close() async {
        await bulk.closeRoute(id)
    }
}

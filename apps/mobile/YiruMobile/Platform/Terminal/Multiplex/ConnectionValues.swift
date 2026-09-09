import Foundation

nonisolated struct MobileTerminalOpenMultiplexWire: Codable, Equatable, Sendable {
    let bulkTicket: String
    let expiresAt: Int64
    let maxFrameBytes: Int
}

nonisolated enum MobileTerminalWireContract {
    static let runtimeProtocolVersion = 6
    static let minimumCompatibleRuntimeServerVersion = 6
    static let multiplexCapability = "/yiru.runtime.v1.TerminalService/Multiplex"
}

nonisolated enum TerminalMultiplexOpcodeWire: UInt8, Sendable {
    case epoch = 1
    case heartbeat = 2
    case subscribe = 16
    case subscribed = 17
    case unsubscribe = 18
    case end = 19
    case error = 20
    case output = 21
    case ack = 22
    case credit = 23
    case input = 24
    case resize = 25
    case resized = 26
    case claimViewport = 27
    case snapshotRequest = 28
    case snapshotStart = 29
    case snapshotChunk = 30
    case snapshotEnd = 31
    case visibilityGate = 32
    case revealSnapshot = 33
    case sideEffectBatch = 34
    case clearBuffer = 35
    case modelRestore = 36
    case signal = 37
    case kill = 38
    case metadata = 39
    case fitOverride = 40
    case driver = 41
}

nonisolated enum MobileTerminalMultiplexWireContract {
    static let kind: UInt8 = 116
    static let version: UInt8 = 1
    static let headerBytes = 40
    static let defaultMaxFrameBytes = 65536
    static let hardMaxFrameBytes = 1048576
}

nonisolated enum TerminalMultiplexHandshakePhase: UInt8, Sendable {
    case offer = 0
    case accept = 1
}

nonisolated enum TerminalMultiplexAppState: UInt8, Sendable {
    case foreground = 0
    case background = 1
    case unknown = 2
}

nonisolated enum TerminalMultiplexEpochRecordWire {
    static let bytes = 24
    static let phaseOffset = 0
    static let protocolMinorOffset = 1
    static let reserved16Offset = 2
    static let maxFrameBytesOffset = 4
    static let maxStreamsOffset = 8
    static let heartbeatMsOffset = 12
    static let connectionGenerationOffset = 16
    static let reserved32Offset = 20
}

nonisolated enum TerminalMultiplexHeartbeatRecordWire {
    static let bytes = 16
    static let phaseOffset = 0
    static let appStateOffset = 1
    static let reserved16Offset = 2
    static let senderQueueBytesOffset = 4
    static let monotonicMicrosOffset = 8
}

import Foundation

nonisolated struct TerminalMultiplexEpochRecord: Equatable, Sendable {
    let phase: TerminalMultiplexHandshakePhase
    let protocolMinor: UInt8
    let maxFrameBytes: UInt32
    let maxStreams: UInt32
    let heartbeatMilliseconds: UInt32
    let connectionGeneration: UInt32
}

nonisolated struct TerminalMultiplexHeartbeatRecord: Equatable, Sendable {
    let phase: TerminalMultiplexHandshakePhase
    let appState: TerminalMultiplexAppState
    let senderQueueBytes: UInt32
    let monotonicMicroseconds: UInt64
}

nonisolated enum TerminalMultiplexConnectionRecordCodec {
    static func encode(_ record: TerminalMultiplexEpochRecord) -> Data {
        let wire = TerminalMultiplexEpochRecordWire.self
        var data = Data(repeating: 0, count: wire.bytes)
        data[wire.phaseOffset] = record.phase.rawValue
        data[wire.protocolMinorOffset] = record.protocolMinor
        TerminalWireBytes.write(record.maxFrameBytes, to: &data, at: wire.maxFrameBytesOffset)
        TerminalWireBytes.write(record.maxStreams, to: &data, at: wire.maxStreamsOffset)
        TerminalWireBytes.write(
            record.heartbeatMilliseconds,
            to: &data,
            at: wire.heartbeatMsOffset
        )
        TerminalWireBytes.write(
            record.connectionGeneration,
            to: &data,
            at: wire.connectionGenerationOffset
        )
        return data
    }

    static func decodeEpoch(_ data: Data) -> TerminalMultiplexEpochRecord? {
        let wire = TerminalMultiplexEpochRecordWire.self
        guard data.count == wire.bytes,
            let phase = TerminalMultiplexHandshakePhase(
                rawValue: TerminalWireBytes.byte(in: data, at: wire.phaseOffset)
            ),
            TerminalWireBytes.uint16(in: data, at: wire.reserved16Offset) == 0,
            TerminalWireBytes.uint32(in: data, at: wire.reserved32Offset) == 0
        else {
            return nil
        }
        return TerminalMultiplexEpochRecord(
            phase: phase,
            protocolMinor: TerminalWireBytes.byte(in: data, at: wire.protocolMinorOffset),
            maxFrameBytes: TerminalWireBytes.uint32(in: data, at: wire.maxFrameBytesOffset),
            maxStreams: TerminalWireBytes.uint32(in: data, at: wire.maxStreamsOffset),
            heartbeatMilliseconds: TerminalWireBytes.uint32(
                in: data,
                at: wire.heartbeatMsOffset
            ),
            connectionGeneration: TerminalWireBytes.uint32(
                in: data,
                at: wire.connectionGenerationOffset
            )
        )
    }

    static func encode(_ record: TerminalMultiplexHeartbeatRecord) -> Data {
        let wire = TerminalMultiplexHeartbeatRecordWire.self
        var data = Data(repeating: 0, count: wire.bytes)
        data[wire.phaseOffset] = record.phase.rawValue
        data[wire.appStateOffset] = record.appState.rawValue
        TerminalWireBytes.write(
            record.senderQueueBytes,
            to: &data,
            at: wire.senderQueueBytesOffset
        )
        TerminalWireBytes.write(
            record.monotonicMicroseconds,
            to: &data,
            at: wire.monotonicMicrosOffset
        )
        return data
    }

    static func decodeHeartbeat(_ data: Data) -> TerminalMultiplexHeartbeatRecord? {
        let wire = TerminalMultiplexHeartbeatRecordWire.self
        guard data.count == wire.bytes,
            let phase = TerminalMultiplexHandshakePhase(
                rawValue: TerminalWireBytes.byte(in: data, at: wire.phaseOffset)
            ),
            let appState = TerminalMultiplexAppState(
                rawValue: TerminalWireBytes.byte(in: data, at: wire.appStateOffset)
            ),
            TerminalWireBytes.uint16(in: data, at: wire.reserved16Offset) == 0
        else {
            return nil
        }
        return TerminalMultiplexHeartbeatRecord(
            phase: phase,
            appState: appState,
            senderQueueBytes: TerminalWireBytes.uint32(
                in: data,
                at: wire.senderQueueBytesOffset
            ),
            monotonicMicroseconds: TerminalWireBytes.uint64(
                in: data,
                at: wire.monotonicMicrosOffset
            )
        )
    }
}

import Foundation

nonisolated struct TerminalMultiplexAckRecord: Equatable, Sendable {
    let kind: UInt8
    let status: UInt8
    let errorCode: UInt16
    let acknowledgedBytes: UInt32
    let cumulativeSequence: UInt64
    let receiverQueueBytes: UInt32
}

nonisolated struct TerminalMultiplexCreditRecord: Equatable, Sendable {
    let direction: UInt8
    let reason: UInt8
    let maxInFlightBytes: UInt32
    let acknowledgeEveryBytes: UInt32
    let maxFrameBytes: UInt32
}

nonisolated struct TerminalMultiplexVisibilityRecord: Equatable, Sendable {
    let isVisible: Bool
    let hasDeliveryInterest: Bool
    let priority: UInt8
    let stateVersion: UInt32
}

nonisolated struct TerminalMultiplexKillRecord: Equatable, Sendable {
    let keepHistory: Bool
}

nonisolated struct TerminalMultiplexInputRecord: Equatable, Sendable {
    let kind: UInt8
    let data: Data
}

nonisolated enum TerminalMultiplexFlowRecordCodec {
    static func encode(_ record: TerminalMultiplexAckRecord) -> Data? {
        let wire = TerminalMultiplexAckRecordWire.self
        guard Int(record.kind) <= wire.kindMax, Int(record.status) <= wire.statusMax else {
            return nil
        }
        var data = Data(repeating: 0, count: wire.bytes)
        data[wire.kindOffset] = record.kind
        data[wire.statusOffset] = record.status
        TerminalWireBytes.write(record.errorCode, to: &data, at: wire.errorCodeOffset)
        TerminalWireBytes.write(
            record.acknowledgedBytes,
            to: &data,
            at: wire.acknowledgedBytesOffset
        )
        TerminalWireBytes.write(
            record.cumulativeSequence,
            to: &data,
            at: wire.cumulativeSeqOffset
        )
        TerminalWireBytes.write(
            record.receiverQueueBytes,
            to: &data,
            at: wire.receiverQueueBytesOffset
        )
        return data
    }

    static func decodeAck(_ data: Data) -> TerminalMultiplexAckRecord? {
        let wire = TerminalMultiplexAckRecordWire.self
        guard data.count == wire.bytes,
            Int(TerminalWireBytes.byte(in: data, at: wire.kindOffset)) <= wire.kindMax,
            Int(TerminalWireBytes.byte(in: data, at: wire.statusOffset)) <= wire.statusMax,
            TerminalWireBytes.uint32(in: data, at: wire.reserved32Offset) == 0
        else {
            return nil
        }
        return TerminalMultiplexAckRecord(
            kind: TerminalWireBytes.byte(in: data, at: wire.kindOffset),
            status: TerminalWireBytes.byte(in: data, at: wire.statusOffset),
            errorCode: TerminalWireBytes.uint16(in: data, at: wire.errorCodeOffset),
            acknowledgedBytes: TerminalWireBytes.uint32(
                in: data,
                at: wire.acknowledgedBytesOffset
            ),
            cumulativeSequence: TerminalWireBytes.uint64(
                in: data,
                at: wire.cumulativeSeqOffset
            ),
            receiverQueueBytes: TerminalWireBytes.uint32(
                in: data,
                at: wire.receiverQueueBytesOffset
            )
        )
    }

    static func encode(_ record: TerminalMultiplexCreditRecord) -> Data? {
        let wire = TerminalMultiplexCreditRecordWire.self
        guard Int(record.direction) <= wire.directionMax, Int(record.reason) <= wire.reasonMax
        else {
            return nil
        }
        var data = Data(repeating: 0, count: wire.bytes)
        data[wire.directionOffset] = record.direction
        data[wire.reasonOffset] = record.reason
        TerminalWireBytes.write(
            record.maxInFlightBytes,
            to: &data,
            at: wire.maxInFlightBytesOffset
        )
        TerminalWireBytes.write(
            record.acknowledgeEveryBytes,
            to: &data,
            at: wire.ackEveryBytesOffset
        )
        TerminalWireBytes.write(record.maxFrameBytes, to: &data, at: wire.maxFrameBytesOffset)
        return data
    }

    static func decodeCredit(_ data: Data) -> TerminalMultiplexCreditRecord? {
        let wire = TerminalMultiplexCreditRecordWire.self
        guard data.count == wire.bytes,
            Int(TerminalWireBytes.byte(in: data, at: wire.directionOffset)) <= wire.directionMax,
            Int(TerminalWireBytes.byte(in: data, at: wire.reasonOffset)) <= wire.reasonMax,
            TerminalWireBytes.uint16(in: data, at: wire.reserved16Offset) == 0
        else {
            return nil
        }
        return TerminalMultiplexCreditRecord(
            direction: TerminalWireBytes.byte(in: data, at: wire.directionOffset),
            reason: TerminalWireBytes.byte(in: data, at: wire.reasonOffset),
            maxInFlightBytes: TerminalWireBytes.uint32(
                in: data,
                at: wire.maxInFlightBytesOffset
            ),
            acknowledgeEveryBytes: TerminalWireBytes.uint32(
                in: data,
                at: wire.ackEveryBytesOffset
            ),
            maxFrameBytes: TerminalWireBytes.uint32(in: data, at: wire.maxFrameBytesOffset)
        )
    }

    static func encode(_ record: TerminalMultiplexVisibilityRecord) -> Data? {
        let wire = TerminalMultiplexVisibilityRecordWire.self
        guard Int(record.priority) <= wire.priorityMax else { return nil }
        var data = Data(repeating: 0, count: wire.bytes)
        data[wire.visibleOffset] = encodeBool(record.isVisible)
        data[wire.deliveryInterestOffset] = encodeBool(record.hasDeliveryInterest)
        data[wire.priorityOffset] = record.priority
        TerminalWireBytes.write(record.stateVersion, to: &data, at: wire.stateVersionOffset)
        return data
    }

    static func encode(_ record: TerminalMultiplexKillRecord) -> Data {
        let wire = TerminalMultiplexKillRecordWire.self
        var data = Data(repeating: 0, count: wire.bytes)
        data[wire.keepHistoryOffset] = encodeBool(record.keepHistory)
        data[wire.immediateOffset] = UInt8(wire.immediateValue)
        return data
    }

    static func encode(_ record: TerminalMultiplexInputRecord) -> Data? {
        let wire = TerminalMultiplexInputRecordWire.self
        guard Int(record.kind) <= wire.kindMax, String(data: record.data, encoding: .utf8) != nil
        else {
            return nil
        }
        var data = Data(repeating: 0, count: wire.headerBytes)
        data[wire.kindOffset] = record.kind
        TerminalWireBytes.write(UInt32(record.data.count), to: &data, at: wire.dataBytesOffset)
        data.append(record.data)
        return data
    }

    private static func decodeBool(_ value: UInt8) -> Bool? {
        switch Int(value) {
        case TerminalMultiplexBooleanWire.falseValue: false
        case TerminalMultiplexBooleanWire.trueValue: true
        default: nil
        }
    }

    private static func encodeBool(_ value: Bool) -> UInt8 {
        UInt8(
            value
                ? TerminalMultiplexBooleanWire.trueValue
                : TerminalMultiplexBooleanWire.falseValue
        )
    }
}

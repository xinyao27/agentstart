import Foundation

nonisolated struct TerminalMultiplexFrame: Equatable, Sendable {
    let opcode: TerminalMultiplexOpcodeWire
    let unsupportedOpcode: UInt8?
    let routeID: UInt32
    let epoch: UInt64
    let sequence: UInt64
    let correlationID: UInt32
    let payload: Data

    init(
        opcode: TerminalMultiplexOpcodeWire,
        routeID: UInt32,
        epoch: UInt64,
        sequence: UInt64 = 0,
        correlationID: UInt32 = 0,
        payload: Data = Data()
    ) {
        self.opcode = opcode
        unsupportedOpcode = nil
        self.routeID = routeID
        self.epoch = epoch
        self.sequence = sequence
        self.correlationID = correlationID
        self.payload = payload
    }

    fileprivate init(
        unsupportedOpcode: UInt8,
        routeID: UInt32,
        epoch: UInt64,
        sequence: UInt64,
        correlationID: UInt32,
        payload: Data
    ) {
        opcode = .error
        self.unsupportedOpcode = unsupportedOpcode
        self.routeID = routeID
        self.epoch = epoch
        self.sequence = sequence
        self.correlationID = correlationID
        self.payload = payload
    }
}

nonisolated enum TerminalMultiplexFrameError: Error, Equatable, Sendable {
    case invalidHeader
    case invalidLength
    case invalidRoute
    case unsupportedOpcode
}

nonisolated enum TerminalMultiplexFrameCodec {
    static func encode(_ frame: TerminalMultiplexFrame) throws -> Data {
        guard frame.unsupportedOpcode == nil else {
            throw TerminalMultiplexFrameError.unsupportedOpcode
        }
        guard isValidRoute(opcode: frame.opcode, routeID: frame.routeID) else {
            throw TerminalMultiplexFrameError.invalidRoute
        }
        guard frame.payload.count <= MobileTerminalMultiplexWireContract.hardMaxFrameBytes else {
            throw TerminalMultiplexFrameError.invalidLength
        }

        var header = Data(
            repeating: 0,
            count: MobileTerminalMultiplexWireContract.headerBytes
        )
        header[0] = MobileTerminalMultiplexWireContract.kind
        header[1] = MobileTerminalMultiplexWireContract.version
        header[2] = frame.opcode.rawValue
        TerminalWireBytes.write(
            UInt16(MobileTerminalMultiplexWireContract.headerBytes),
            to: &header,
            at: 4
        )
        TerminalWireBytes.write(frame.routeID, to: &header, at: 8)
        TerminalWireBytes.write(UInt32(frame.payload.count), to: &header, at: 12)
        TerminalWireBytes.write(frame.epoch, to: &header, at: 16)
        TerminalWireBytes.write(frame.sequence, to: &header, at: 24)
        TerminalWireBytes.write(frame.correlationID, to: &header, at: 32)
        header.append(frame.payload)
        return header
    }

    static func decode(
        _ data: Data,
        maxFrameBytes: Int = MobileTerminalMultiplexWireContract.defaultMaxFrameBytes
    ) throws -> TerminalMultiplexFrame {
        let headerBytes = MobileTerminalMultiplexWireContract.headerBytes
        guard data.count >= headerBytes,
            TerminalWireBytes.byte(in: data, at: 0) == MobileTerminalMultiplexWireContract.kind,
            TerminalWireBytes.byte(in: data, at: 1) == MobileTerminalMultiplexWireContract.version,
            TerminalWireBytes.byte(in: data, at: 3) == 0,
            TerminalWireBytes.uint16(in: data, at: 4) == headerBytes,
            TerminalWireBytes.uint16(in: data, at: 6) == 0,
            TerminalWireBytes.uint32(in: data, at: 36) == 0
        else {
            throw TerminalMultiplexFrameError.invalidHeader
        }

        let opcodeValue = TerminalWireBytes.byte(in: data, at: 2)
        let routeID = TerminalWireBytes.uint32(in: data, at: 8)
        let payloadBytes = Int(TerminalWireBytes.uint32(in: data, at: 12))
        let epoch = TerminalWireBytes.uint64(in: data, at: 16)
        let sequence = TerminalWireBytes.uint64(in: data, at: 24)
        let correlationID = TerminalWireBytes.uint32(in: data, at: 32)

        guard let opcode = TerminalMultiplexOpcodeWire(rawValue: opcodeValue) else {
            guard routeID > 0 else { throw TerminalMultiplexFrameError.invalidRoute }
            try validateLength(data, payloadBytes: payloadBytes, maxFrameBytes: maxFrameBytes)
            return TerminalMultiplexFrame(
                unsupportedOpcode: opcodeValue,
                routeID: routeID,
                epoch: epoch,
                sequence: sequence,
                correlationID: correlationID,
                payload: data.subdata(in: headerBytes..<data.count)
            )
        }
        guard isValidRoute(opcode: opcode, routeID: routeID) else {
            throw TerminalMultiplexFrameError.invalidRoute
        }
        try validateLength(data, payloadBytes: payloadBytes, maxFrameBytes: maxFrameBytes)
        return TerminalMultiplexFrame(
            opcode: opcode,
            routeID: routeID,
            epoch: epoch,
            sequence: sequence,
            correlationID: correlationID,
            payload: data.subdata(in: headerBytes..<data.count)
        )
    }

    private static func validateLength(_ data: Data, payloadBytes: Int, maxFrameBytes: Int) throws {
        let effectiveMax = min(
            max(0, maxFrameBytes),
            MobileTerminalMultiplexWireContract.hardMaxFrameBytes
        )
        guard payloadBytes <= effectiveMax,
            payloadBytes <= MobileTerminalMultiplexWireContract.hardMaxFrameBytes,
            data.count == MobileTerminalMultiplexWireContract.headerBytes + payloadBytes
        else {
            throw TerminalMultiplexFrameError.invalidLength
        }
    }

    private static func isValidRoute(
        opcode: TerminalMultiplexOpcodeWire,
        routeID: UInt32
    ) -> Bool {
        switch opcode {
        case .epoch, .heartbeat:
            routeID == 0
        default:
            routeID > 0
        }
    }
}

import Foundation

nonisolated enum TerminalMultiplexStreamRecordWire {
    static let columnsMin = 1
    static let columnsMax = 1000
    static let rowsMin = 1
    static let rowsMax = 500
    static let snapshotMaxBytes = 2097152
}

nonisolated enum TerminalMultiplexClientType: String, Codable, Sendable {
    case desktop = "desktop"
    case mobile = "mobile"
    case web = "web"
}

nonisolated enum TerminalMultiplexDeliveryPriority: String, Codable, Sendable {
    case parked = "parked"
    case visible = "visible"
    case active = "active"
}

nonisolated enum TerminalMultiplexInitialState: String, Codable, Sendable {
    case snapshot = "snapshot"
    case resume = "resume"
    case empty = "empty"
}

nonisolated enum TerminalMultiplexPtyState: String, Codable, Sendable {
    case running = "running"
    case exited = "exited"
}

nonisolated enum TerminalMultiplexDisplayMode: String, Codable, Sendable {
    case auto = "auto"
    case desktop = "desktop"
}

nonisolated enum TerminalMultiplexDriverKind: String, Codable, Sendable {
    case idle = "idle"
    case desktop = "desktop"
    case mobile = "mobile"
}

nonisolated enum TerminalMultiplexResizeReason: String, Codable, Sendable {
    case fit = "fit"
    case user = "user"
    case restorePulse = "restore-pulse"
}

nonisolated enum TerminalMultiplexEndReason: String, Codable, Sendable {
    case exit = "exit"
    case killed = "killed"
    case gone = "gone"
    case transportReplaced = "transport-replaced"
}

nonisolated enum TerminalMultiplexModelRestoreReason: String, Codable, Sendable {
    case hiddenDrop = "hidden-drop"
    case pendingCap = "pending-cap"
    case ackStall = "ack-stall"
    case sequenceGap = "sequence-gap"
    case providerGap = "provider-gap"
    case rendererReplaced = "renderer-replaced"
}

nonisolated struct TerminalMultiplexViewportRecord: Codable, Equatable, Sendable {
    let cols: Int
    let rows: Int
}

nonisolated struct TerminalMultiplexClientRecord: Encodable, Sendable {
    let id: String
    let type: TerminalMultiplexClientType
}

nonisolated struct TerminalMultiplexDeliveryRecord: Encodable, Sendable {
    let visible: Bool
    let interested: Bool
    let priority: TerminalMultiplexDeliveryPriority
}

nonisolated struct TerminalMultiplexCapabilitiesRecord: Encodable, Sendable {
    let dualScreenSnapshot = 1
    let parseAck = 1
    let explicitWriteAck = 1
}

nonisolated struct TerminalMultiplexSubscribeRecord: Encodable, Sendable {
    let terminal: String
    let transportGeneration: String
    let client: TerminalMultiplexClientRecord
    let viewport: TerminalMultiplexViewportRecord?
    let lastParsedSeq: String
    let delivery: TerminalMultiplexDeliveryRecord
    let snapshotMaxBytes: Int
    let capabilities: TerminalMultiplexCapabilitiesRecord
}

nonisolated struct TerminalMultiplexSubscribedRecord: Decodable, Sendable {
    let terminal: String
    let transportGeneration: String
    let ptyState: TerminalMultiplexPtyState
    let cols: Int
    let rows: Int
    let displayMode: TerminalMultiplexDisplayMode
    let driver: TerminalMultiplexDriverRecord
    let initialState: TerminalMultiplexInitialState
    let snapshotId: UInt32?
    let truncated: Bool
}

nonisolated struct TerminalMultiplexDriverRecord: Decodable, Sendable {
    let kind: TerminalMultiplexDriverKind
    let clientId: String?

    private enum CodingKeys: String, CodingKey {
        case kind
        case clientId
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(TerminalMultiplexDriverKind.self, forKey: .kind)
        switch kind {
        case .idle:
            guard !container.contains(.clientId) else {
                throw DecodingError.dataCorruptedError(
                    forKey: .clientId,
                    in: container,
                    debugDescription: "Terminal driver client ID is not allowed"
                )
            }
            clientId = nil
        case .desktop:
            guard !container.contains(.clientId) else {
                throw DecodingError.dataCorruptedError(
                    forKey: .clientId,
                    in: container,
                    debugDescription: "Terminal driver client ID is not allowed"
                )
            }
            clientId = nil
        case .mobile:
            let value = try container.decode(String.self, forKey: .clientId)
            guard !value.isEmpty else {
                throw DecodingError.dataCorruptedError(
                    forKey: .clientId,
                    in: container,
                    debugDescription: "Terminal driver client ID must not be empty"
                )
            }
            clientId = value
        }
    }
}

nonisolated struct TerminalMultiplexResizeRecord: Encodable, Sendable {
    let cols: Int
    let rows: Int
    let reason: TerminalMultiplexResizeReason
}

nonisolated struct TerminalMultiplexErrorRecord: Decodable, Sendable {
    let message: String?
}

nonisolated struct TerminalMultiplexRevealRecord: Encodable, Sendable {
    let stateVersion: UInt32
}

nonisolated struct TerminalMultiplexSnapshotRequestRecord: Encodable, Sendable {
    let requestedScrollbackRows: UInt32
    let snapshotMaxBytes: UInt32?
}

nonisolated struct TerminalMultiplexEndRecord: Decodable, Sendable {
    let exitCode: Int32?
    let reason: TerminalMultiplexEndReason
    let historyKept: Bool

    private enum CodingKeys: String, CodingKey {
        case exitCode
        case reason
        case historyKept
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard container.contains(.exitCode) else {
            throw DecodingError.keyNotFound(
                CodingKeys.exitCode,
                DecodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "Missing terminal exit code"
                )
            )
        }
        exitCode = try container.decodeIfPresent(Int32.self, forKey: .exitCode)
        reason = try container.decode(TerminalMultiplexEndReason.self, forKey: .reason)
        historyKept = try container.decode(Bool.self, forKey: .historyKept)
    }
}

nonisolated struct TerminalMultiplexModelRestoreRecord: Decodable, Sendable {
    let reason: TerminalMultiplexModelRestoreReason
    let markerSeq: String
    let snapshotFollows: Bool
}

import Foundation

nonisolated enum MobileE2EEPayloadKindWire: String, Codable, Equatable, Sendable {
    case text = "text"
    case binary = "binary"
}

nonisolated struct MobileE2EEContextWire: Codable, Equatable, Sendable {
    let protocolName: String
    let initiator: String
    let responder: String
    let transport: String

    private enum CodingKeys: String, CodingKey {
        case protocolName = "protocol"
        case initiator
        case responder
        case transport
    }
}

nonisolated struct MobileE2EECapabilitiesWire: Codable, Equatable, Sendable {
    let framing: [Int]
    let payloadKinds: [MobileE2EEPayloadKindWire]
}

nonisolated struct MobileE2EEHelloWire: Codable, Equatable, Sendable {
    let type: String
    let v: Int
    let clientPublicKeyB64: String
    let clientNonceB64: String
    let capabilities: MobileE2EECapabilitiesWire
    let context: MobileE2EEContextWire
}

nonisolated struct MobileE2EESelectionWire: Codable, Equatable, Sendable {
    let framing: Int
    let payloadKinds: [MobileE2EEPayloadKindWire]
}

nonisolated struct MobileE2EEReadyWire: Codable, Equatable, Sendable {
    let type: String
    let v: Int
    let desktopPublicKeyB64: String
    let clientNonceB64: String
    let desktopNonceB64: String
    let selection: MobileE2EESelectionWire
    let context: MobileE2EEContextWire
}

nonisolated enum MobileE2EEWireContract {
    static let protocolName = "agentstart-mobile-e2ee"
    static let initiator = "mobile"
    static let responder = "desktop"
    static let directTransport = "direct"
    static let helloType = "e2ee_hello"
    static let readyType = "e2ee_ready"
    static let version = 2
    static let framing = 2
    static let kdfDomain = "agentstart-mobile-e2ee/v2"
    static let transcriptDomain = "agentstart-mobile-e2ee/v2/transcript"
}

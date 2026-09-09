import Foundation

nonisolated enum PairingScopeWire: String, Codable, Equatable, Sendable {
    case mobile
    case runtime
}

nonisolated struct PairingOfferWire: Codable, Equatable, Sendable {
    let v: Int
    let endpoint: String
    let deviceToken: String
    let publicKeyB64: String
    let scope: PairingScopeWire?
}

nonisolated enum MobilePairingWireContract {
    static let offerVersion = 2
}

import Foundation

nonisolated enum PairingScope: String, Hashable, Sendable {
    case mobile
    case runtime
}

nonisolated struct PairingOffer: Hashable, Sendable {
    let endpoint: String
    let deviceToken: String
    let publicKey: Data
    let publicKeyBase64: String
    let scope: PairingScope?
}

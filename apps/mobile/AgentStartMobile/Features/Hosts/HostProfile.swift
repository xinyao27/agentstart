import Foundation

nonisolated struct HostProfile: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let endpoint: String
    let publicKeyBase64: String
    let lastConnected: Date
}

nonisolated struct HostCredential: Equatable, Sendable {
    let profile: HostProfile
    let deviceToken: String
}

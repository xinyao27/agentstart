import Foundation

nonisolated protocol HostRepository: Sendable {
    func hosts() async throws -> [HostProfile]
    func credential(for hostID: String) async throws -> HostCredential?
    func saveAuthenticatedOffer(_ offer: PairingOffer, connectedAt: Date) async throws
        -> HostProfile
    func updateHost(hostID: String, name: String, endpoint: String) async throws -> HostProfile
    func removeHost(hostID: String) async throws
}

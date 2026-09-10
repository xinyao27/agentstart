import Foundation
import Security

actor KeychainHostRepository: HostRepository {
    private let defaults = UserDefaults.standard
    private let metadataKey = "agentstart.hosts.v1"
    private let pendingCredentialCleanupKey = "agentstart.pending-host-credential-cleanups.v1"
    private let keychainService = "me.xinyao.agentstart.mobile.host-credential"
    private let developmentTokenPrefix = "agentstart:development-host-token:"

    func hosts() throws -> [HostProfile] {
        try storedHosts().filter { profile in
            (try? hasToken(hostID: profile.id)) == true
        }
    }

    func credential(for hostID: String) throws -> HostCredential? {
        guard let profile = try storedHosts().first(where: { $0.id == hostID }),
            let token = try readToken(hostID: hostID)
        else {
            return nil
        }
        return HostCredential(profile: profile, deviceToken: token)
    }

    func saveAuthenticatedOffer(_ offer: PairingOffer, connectedAt: Date) throws -> HostProfile {
        var current = try storedHosts()
        let previous = current
        let existing = current.first(where: { $0.publicKeyBase64 == offer.publicKeyBase64 })
        let profile = HostProfile(
            id: existing?.id ?? UUID().uuidString.lowercased(),
            name: existing?.name ?? nextHostName(current),
            endpoint: offer.endpoint,
            publicKeyBase64: offer.publicKeyBase64,
            lastConnected: connectedAt
        )
        let replacedDevelopmentHostIDs = current.compactMap { candidate -> String? in
            guard shouldReplaceDevelopmentHost(candidate, with: profile) else { return nil }
            return candidate.id
        }

        current.removeAll {
            $0.id == profile.id || $0.publicKeyBase64 == profile.publicKeyBase64
                || replacedDevelopmentHostIDs.contains($0.id)
        }
        current.append(profile)
        try writeHosts(current)
        do {
            try writeToken(offer.deviceToken, hostID: profile.id)
        } catch {
            try? writeHosts(previous)
            throw error
        }
        for hostID in replacedDevelopmentHostIDs {
            removeCredential(hostID: hostID)
        }
        return profile
    }

    func updateHost(hostID: String, name: String, endpoint: String) throws -> HostProfile {
        var current = try storedHosts()
        guard let index = current.firstIndex(where: { $0.id == hostID }) else {
            throw HostRepositoryError.hostNotFound
        }
        let previous = current[index]
        let updated = HostProfile(
            id: previous.id,
            name: name,
            endpoint: endpoint,
            publicKeyBase64: previous.publicKeyBase64,
            lastConnected: previous.lastConnected
        )
        current[index] = updated
        try writeHosts(current)
        return updated
    }

    func removeHost(hostID: String) throws {
        var current = try storedHosts()
        guard current.contains(where: { $0.id == hostID }) else {
            throw HostRepositoryError.hostNotFound
        }
        current.removeAll { $0.id == hostID }
        try writeHosts(current)
        removeCredential(hostID: hostID)
    }

    func pendingCredentialCleanup() -> CredentialCleanupState {
        guard let storedValue = defaults.object(forKey: pendingCredentialCleanupKey) else {
            return CredentialCleanupState(pendingCount: 0, isStorageUnreadable: false)
        }
        guard let values = storedValue as? [String] else {
            return CredentialCleanupState(pendingCount: 0, isStorageUnreadable: true)
        }
        return CredentialCleanupState(
            pendingCount: Set(values).count,
            isStorageUnreadable: false
        )
    }

    func retryPendingCredentialCleanup() -> CredentialCleanupState {
        let initial = pendingCredentialCleanup()
        guard !initial.isStorageUnreadable else { return initial }

        var pending = pendingCredentialCleanupIDs()
        for hostID in pending {
            do {
                try deleteToken(hostID: hostID)
                pending.remove(hostID)
                writePendingCredentialCleanupIDs(pending)
            } catch {
                continue
            }
        }
        return CredentialCleanupState(
            pendingCount: pending.count,
            isStorageUnreadable: false
        )
    }

    private func storedHosts() throws -> [HostProfile] {
        if let data = defaults.data(forKey: metadataKey) {
            do {
                return try JSONDecoder().decode([HostProfile].self, from: data)
            } catch {
                throw HostRepositoryError.metadataUnreadable
            }
        }
        return []
    }

    private func writeHosts(_ hosts: [HostProfile]) throws {
        let data: Data
        do {
            data = try JSONEncoder().encode(hosts)
        } catch {
            throw HostRepositoryError.metadataUnreadable
        }
        defaults.set(data, forKey: metadataKey)
    }

    private func nextHostName(_ hosts: [HostProfile]) -> String {
        let largest = hosts.reduce(0) { current, host in
            guard host.name.hasPrefix("Host "),
                let number = Int(host.name.dropFirst("Host ".count))
            else {
                return current
            }
            return max(current, number)
        }
        return String(localized: "Host \(largest + 1)")
    }

    private func hasToken(hostID: String) throws -> Bool {
        try readToken(hostID: hostID) != nil
    }

    private func readToken(hostID: String) throws -> String? {
        if usesDevelopmentTokenStore {
            return defaults.string(forKey: developmentTokenKey(hostID: hostID))
        }
        return try readToken(query: keychainQuery(hostID: hostID))
    }

    private func readToken(query baseQuery: [String: Any]) throws -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
            let data = result as? Data,
            let token = String(data: data, encoding: .utf8)
        else {
            throw HostRepositoryError.keychainOperation("read token", status)
        }
        return token
    }

    private func writeToken(_ token: String, hostID: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw HostRepositoryError.invalidToken
        }
        if usesDevelopmentTokenStore {
            // Why: unsigned iOS Simulator builds cannot access the production Keychain
            // access group. Keep automatic Desktop pairing usable in development while
            // leaving physical-device and release credentials on Keychain.
            defaults.set(token, forKey: developmentTokenKey(hostID: hostID))
            return
        }
        let query = keychainQuery(hostID: hostID)
        let update = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw HostRepositoryError.keychainOperation("update token", updateStatus)
        }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw HostRepositoryError.keychainOperation("add token", addStatus)
        }
    }

    private func deleteToken(hostID: String) throws {
        if usesDevelopmentTokenStore {
            defaults.removeObject(forKey: developmentTokenKey(hostID: hostID))
            return
        }
        let status = SecItemDelete(keychainQuery(hostID: hostID) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw HostRepositoryError.keychain(status)
        }
    }

    private func pendingCredentialCleanupIDs() -> Set<String> {
        guard let values = defaults.stringArray(forKey: pendingCredentialCleanupKey) else {
            return []
        }
        return Set(values)
    }

    private func writePendingCredentialCleanupIDs(_ ids: Set<String>) {
        defaults.set(ids.sorted(), forKey: pendingCredentialCleanupKey)
    }

    private func removeCredential(hostID: String) {
        var pending = pendingCredentialCleanupIDs()
        pending.insert(hostID)
        writePendingCredentialCleanupIDs(pending)
        do {
            try deleteToken(hostID: hostID)
            pending.remove(hostID)
            writePendingCredentialCleanupIDs(pending)
        } catch {
            // Why: metadata removal already committed. The durable queue keeps
            // a locked-keychain failure recoverable without resurrecting the host.
        }
    }

    private func shouldReplaceDevelopmentHost(
        _ candidate: HostProfile,
        with profile: HostProfile
    ) -> Bool {
        #if DEBUG && targetEnvironment(simulator)
            // Why: development Desktop ports and identities can change between runs; retaining
            // old loopback offers creates permanent reconnect storms in the simulator.
            guard ProcessInfo.processInfo.arguments.contains("--development-auto-pair"),
                candidate.id != profile.id,
                URL(string: candidate.endpoint)?.host == "127.0.0.1",
                URL(string: profile.endpoint)?.host == "127.0.0.1"
            else { return false }
            return true
        #else
            return false
        #endif
    }

    private func keychainQuery(hostID: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: hostID,
        ]
    }

    private func developmentTokenKey(hostID: String) -> String {
        "\(developmentTokenPrefix)\(hostID)"
    }

    private var usesDevelopmentTokenStore: Bool {
        #if DEBUG && targetEnvironment(simulator)
            true
        #else
            false
        #endif
    }

}

extension KeychainHostRepository: CredentialCleanupRepository {}

nonisolated enum HostRepositoryError: Error, LocalizedError {
    case hostNotFound
    case metadataUnreadable
    case invalidToken
    case keychain(OSStatus)
    case keychainOperation(String, OSStatus)

    var errorDescription: String? {
        switch self {
        case .hostNotFound:
            "Saved daemon host was not found."
        case .metadataUnreadable:
            "Saved daemon metadata could not be read."
        case .invalidToken:
            "The daemon returned an invalid pairing credential."
        case .keychain(let status):
            "Keychain operation failed (\(status))."
        case .keychainOperation(let operation, let status):
            "Keychain \(operation) failed (\(status))."
        }
    }
}

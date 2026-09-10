import Foundation

actor DirectPairingClient: PairingRuntime {
    private let hosts: any HostRepository
    private let timeout: Duration

    init(hosts: any HostRepository, timeout: Duration = .seconds(25)) {
        self.hosts = hosts
        self.timeout = timeout
    }

    func pair(
        _ offer: PairingOffer,
        log: @escaping PairingLogSink
    ) async throws -> HostProfile {
        return try await withThrowingTaskGroup(of: HostProfile.self) { group in
            group.addTask { try await self.authenticateAndSave(offer, log: log) }
            group.addTask {
                try await Task.sleep(for: self.timeout)
                await log(.error, "Pairing timed out", "The daemon did not respond in time.")
                throw PairingRuntimeError.timeout
            }
            guard let result = try await group.next() else {
                throw PairingRuntimeError.cancelled
            }
            group.cancelAll()
            return result
        }
    }

    private func authenticateAndSave(
        _ offer: PairingOffer,
        log: @escaping PairingLogSink
    ) async throws -> HostProfile {
        let connection: AuthenticatedRuntimeConnection
        do {
            connection = try await AuthenticatedRuntimeConnection.connect(
                endpoint: offer.endpoint,
                desktopPublicKeyBase64: offer.publicKeyBase64,
                deviceToken: offer.deviceToken,
                log: { level, message, detail in
                    await log(pairingLogLevel(level), message, detail)
                }
            )
        } catch AuthenticatedRuntimeError.invalidEndpoint {
            await log(.error, "Invalid daemon endpoint", offer.endpoint)
            throw PairingRuntimeError.invalidEndpoint
        } catch AuthenticatedRuntimeError.authenticationFailed {
            await log(.error, "Authentication failed", "Generate a new pairing code.")
            throw PairingRuntimeError.authenticationFailed
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            let detail = error.localizedDescription
            await log(.error, "Pairing failed", detail)
            throw PairingRuntimeError.connectionFailed(detail)
        }
        await log(.success, "Secure connection established", nil)
        await connection.close()
        let host = try await hosts.saveAuthenticatedOffer(offer, connectedAt: Date())
        await log(.success, "Pairing credential saved", nil)
        return host
    }
}

private func pairingLogLevel(_ level: ConnectionLogLevel) -> PairingLogLevel {
    switch level {
    case .info: .info
    case .success: .success
    case .warning: .warning
    case .error: .error
    }
}

import Foundation

nonisolated struct RuntimeTerminalConnectionContext: Sendable {
    let credential: HostCredential
    let controlSession: RuntimeHostSession
    let clientInstanceID: String
}

nonisolated struct ManagedRuntimeTerminalMultiplexer: Sendable {
    let credential: HostCredential
    let multiplexer: RuntimeTerminalMultiplexer
}

extension RuntimeClient {
    func openTerminalSession(
        hostID: String,
        terminalID: String,
        viewport: TerminalGridSize?
    ) async throws
        -> any TerminalSession
    {
        let context = try await terminalConnectionContext(for: hostID)
        let multiplexer = await terminalMultiplexer(for: context)
        return try await multiplexer.openSession(terminalID: terminalID, viewport: viewport)
    }

    private func terminalMultiplexer(
        for context: RuntimeTerminalConnectionContext
    ) async -> RuntimeTerminalMultiplexer {
        let hostID = context.credential.profile.id
        if let managed = terminalMultiplexers[hostID], managed.credential == context.credential {
            return managed.multiplexer
        }
        if let previous = terminalMultiplexers.removeValue(forKey: hostID) {
            await previous.multiplexer.shutdown()
        }
        let multiplexer = RuntimeTerminalMultiplexer(
            credential: context.credential,
            controlSession: context.controlSession,
            clientInstanceID: context.clientInstanceID
        )
        terminalMultiplexers[hostID] = ManagedRuntimeTerminalMultiplexer(
            credential: context.credential,
            multiplexer: multiplexer
        )
        return multiplexer
    }
}

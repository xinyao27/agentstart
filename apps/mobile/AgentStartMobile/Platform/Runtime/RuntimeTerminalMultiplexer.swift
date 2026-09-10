import AgentStartProtocol
import Foundation
import SwiftProtobuf

actor RuntimeTerminalMultiplexer {
    private struct ConnectedBulk: Sendable {
        let connection: TerminalBulkConnection
        let controlGeneration: Int
    }

    private let credential: HostCredential
    private let controlSession: RuntimeHostSession
    private let clientInstanceID: String
    private var bulk: TerminalBulkConnection?
    private var connectionTask: Task<ConnectedBulk, Error>?
    private var connectionAttempt: UUID?
    private var bulkControlGeneration: Int?
    private var isShutdown = false

    init(
        credential: HostCredential,
        controlSession: RuntimeHostSession,
        clientInstanceID: String
    ) {
        self.credential = credential
        self.controlSession = controlSession
        self.clientInstanceID = clientInstanceID
    }

    func openSession(terminalID: String, viewport: TerminalGridSize?) async throws
        -> any TerminalSession
    {
        guard !isShutdown else { throw RuntimeTerminalMultiplexerError.closed }
        var request = AgentStart_Runtime_V1_TerminalServiceShowRequest()
        request.terminal = terminalID
        let shown = try await controlSession.protocolUnary(
            procedure: AgentStartRuntimeV1TerminalServiceMethods.show,
            request: request,
            response: AgentStart_Runtime_V1_TerminalServiceShowResponse.self
        )
        guard !isShutdown else { throw RuntimeTerminalMultiplexerError.closed }
        var activeBulk = try await activeBulk()
        let route: TerminalBulkRoute
        do {
            route = try await activeBulk.openRoute()
        } catch TerminalBulkConnectionError.routeIDsExhausted {
            await activeBulk.close()
            bulk = nil
            bulkControlGeneration = nil
            activeBulk = try await self.activeBulk()
            route = try await activeBulk.openRoute()
        }
        let session = TerminalMultiplexSession(
            route: route,
            terminalID: terminalID,
            transportGeneration: shown.transportGeneration,
            clientID: clientInstanceID,
            viewport: viewport
        )
        await session.start()
        return session
    }

    func shutdown() async {
        guard !isShutdown else { return }
        isShutdown = true
        connectionAttempt = nil
        connectionTask?.cancel()
        connectionTask = nil
        let closingBulk = bulk
        bulk = nil
        bulkControlGeneration = nil
        await closingBulk?.close()
    }

    private func activeBulk() async throws -> TerminalBulkConnection {
        let currentGeneration = await controlSession.generation()
        if let bulk, await bulk.isOpen(), bulkControlGeneration == currentGeneration {
            return bulk
        }
        await bulk?.close()
        bulk = nil
        bulkControlGeneration = nil
        if let connectionTask {
            do {
                let connected = try await connectionTask.value
                guard !isShutdown, connectionAttempt != nil else {
                    await connected.connection.close()
                    throw CancellationError()
                }
                guard await controlSession.generation() == connected.controlGeneration else {
                    await connected.connection.close()
                    self.connectionTask = nil
                    throw RuntimeTerminalMultiplexerError.controlGenerationChanged
                }
                self.connectionTask = nil
                bulk = connected.connection
                bulkControlGeneration = connected.controlGeneration
                return connected.connection
            } catch {
                self.connectionTask = nil
                throw error
            }
        }
        let attempt = UUID()
        connectionAttempt = attempt
        let task = makeConnectionTask()
        connectionTask = task
        do {
            let connected = try await task.value
            guard connectionAttempt == attempt, !isShutdown else {
                await connected.connection.close()
                throw CancellationError()
            }
            bulk = connected.connection
            bulkControlGeneration = connected.controlGeneration
            connectionTask = nil
            return connected.connection
        } catch {
            if connectionAttempt == attempt {
                connectionTask = nil
            }
            throw error
        }
    }

    private func makeConnectionTask() -> Task<ConnectedBulk, Error> {
        let credential = credential
        let controlSession = controlSession
        let clientInstanceID = clientInstanceID
        return Task {
            let status = try await controlSession.protocolStatus()
            let controlGeneration = await controlSession.generation()
            guard
                status.capabilities?.contains(MobileTerminalWireContract.multiplexCapability)
                    == true
            else {
                throw RuntimeTerminalMultiplexerError.capabilityUnavailable
            }
            guard await controlSession.generation() == controlGeneration else {
                throw RuntimeTerminalMultiplexerError.controlGenerationChanged
            }
            var request = AgentStart_Runtime_V1_TerminalServiceOpenMultiplexRequest()
            request.environmentID = status.runtimeId
            request.clientInstanceID = clientInstanceID
            let response = try await controlSession.protocolUnary(
                procedure: AgentStartRuntimeV1TerminalServiceMethods.openMultiplex,
                request: request,
                response: AgentStart_Runtime_V1_TerminalServiceOpenMultiplexResponse.self
            )
            // Why: the duplex stream retains terminal framing inside protobuf payloads.
            let ticket = MobileTerminalOpenMultiplexWire(
                bulkTicket: response.bulkTicket,
                expiresAt: Int64(response.expiresAt),
                maxFrameBytes: Int(response.maxFrameBytes)
            )
            guard await controlSession.generation() == controlGeneration else {
                throw RuntimeTerminalMultiplexerError.controlGenerationChanged
            }
            let connection = try await TerminalBulkConnection.connect(
                ticket: ticket,
                credential: credential,
                isControlGenerationCurrent: {
                    await controlSession.generation() == controlGeneration
                }
            )
            guard await controlSession.generation() == controlGeneration else {
                await connection.close()
                throw RuntimeTerminalMultiplexerError.controlGenerationChanged
            }
            return ConnectedBulk(
                connection: connection,
                controlGeneration: controlGeneration
            )
        }
    }
}

nonisolated enum RuntimeTerminalMultiplexerError: Error, Sendable {
    case capabilityUnavailable
    case closed
    case controlGenerationChanged
}

import Foundation

// Why: URLSessionWebSocketTask defaults `maximumMessageSize` to 1 MiB
// (1,048,576 bytes) and was never configured here, so any single JSON
// response crossing that line closes the socket with POSIX 40 ("Message too
// long") — surfaced to the UI as an opaque "Desktop returned an invalid
// response" with no size information at all (root-caused via
// receiveLoop()'s underlying-error logging: a 656 KB frame arrived fine,
// the next frame over the default ceiling killed the connection).
// Measured realistic payloads on this connection: git.status for a
// 1,101-file repo is ~130-170 KB on the wire; worktree.ps for up to
// DEFAULT_WORKTREE_PS_LIMIT (200) worktrees, each carrying an agents array
// through compactWorktreePsForMobile's per-field text caps, can plausibly
// reach several hundred KB to low single-digit MB on an active host. 8 MiB
// gives real headroom over both without being unbounded — an unbounded
// limit only trades a broken screen for an unbounded-memory-pressure crash
// on the same feed.
nonisolated private let runtimeWebSocketMaximumMessageSize = 8 * 1024 * 1024
nonisolated let authenticatedRuntimeProtobufCapability = "agentstart-protobuf-v2"

nonisolated private final class PingResult: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Error>?

    func store(_ continuation: CheckedContinuation<Void, Error>) {
        lock.lock()
        self.continuation = continuation
        lock.unlock()
    }

    func resume(with error: Error?) {
        lock.lock()
        let continuation = self.continuation
        self.continuation = nil
        lock.unlock()
        guard let continuation else { return }
        // Why: URLSession can report both the socket failure and the ping callback while a
        // WebSocket closes. Resuming only the first callback keeps reconnect from crashing.
        if let error {
            continuation.resume(throwing: error)
        } else {
            continuation.resume()
        }
    }
}

actor AuthenticatedRuntimeConnection {
    nonisolated let capabilities: Set<String>
    private let socket: URLSessionWebSocketTask
    private var cipher: MobileE2EECipher
    private var isClosed = false

    private init(
        socket: URLSessionWebSocketTask,
        cipher: MobileE2EECipher,
        capabilities: Set<String>
    ) {
        self.capabilities = capabilities
        self.socket = socket
        self.cipher = cipher
    }

    static func connect(
        endpoint: String,
        desktopPublicKeyBase64: String,
        deviceToken: String,
        timeout: Duration = .seconds(17),
        log: @escaping RuntimeConnectionLogSink = { _, _, _ in }
    ) async throws -> AuthenticatedRuntimeConnection {
        guard let url = URL(string: endpoint), url.scheme == "ws" || url.scheme == "wss" else {
            throw AuthenticatedRuntimeError.invalidEndpoint
        }
        guard let desktopPublicKey = Data(base64Encoded: desktopPublicKeyBase64),
            desktopPublicKey.base64EncodedString() == desktopPublicKeyBase64,
            desktopPublicKey.count == 32
        else {
            throw AuthenticatedRuntimeError.invalidDesktopKey
        }

        let socket = URLSession.shared.webSocketTask(with: url)
        socket.maximumMessageSize = runtimeWebSocketMaximumMessageSize
        await log(.info, "Opening WebSocket", endpoint)
        socket.resume()
        return try await withTaskCancellationHandler {
            do {
                return try await withThrowingTaskGroup(
                    of: AuthenticatedRuntimeConnection.self
                ) { group in
                    group.addTask {
                        try await withTaskCancellationHandler {
                            await log(.info, "Starting encrypted handshake", nil)
                            return try await authenticate(
                                socket: socket,
                                desktopPublicKey: desktopPublicKey,
                                deviceToken: deviceToken
                            )
                        } onCancel: {
                            socket.cancel(with: .goingAway, reason: nil)
                        }
                    }
                    group.addTask {
                        try await Task.sleep(for: timeout)
                        throw AuthenticatedRuntimeError.timeout
                    }
                    guard let connection = try await group.next() else {
                        throw CancellationError()
                    }
                    group.cancelAll()
                    return connection
                }
            } catch {
                socket.cancel(with: .goingAway, reason: nil)
                throw error
            }
        } onCancel: {
            socket.cancel(with: .goingAway, reason: nil)
        }
    }

    private static func authenticate(
        socket: URLSessionWebSocketTask,
        desktopPublicKey: Data,
        deviceToken: String
    ) async throws -> AuthenticatedRuntimeConnection {
        let keyPair = try SodiumKeyExchange.makeKeyPair()
        let clientNonce = try SodiumKeyExchange.randomBytes(count: 32)
        let hello = try MobileE2EEHandshake.makeHello(
            publicKey: keyPair.publicKey,
            clientNonce: clientNonce
        )
        try await sendPlaintext(hello, over: socket)

        let readyData = Data(try await receivePlaintext(over: socket).utf8)
        let handshake = try MobileE2EEHandshake.validateReady(
            readyData,
            hello: hello,
            pinnedDesktopPublicKey: desktopPublicKey
        )
        let sharedSecret = try SodiumKeyExchange.sharedSecret(
            secretKey: keyPair.secretKey,
            desktopPublicKey: desktopPublicKey
        )
        let schedule = try MobileE2EEKeySchedule.derive(
            sharedSecret: sharedSecret,
            transcript: handshake.transcript(),
            clientNonce: handshake.clientNonce,
            desktopNonce: handshake.desktopNonce
        )
        var cipher = MobileE2EECipher(schedule: schedule)
        let auth = MobileE2EEAuthFrame(
            type: "e2ee_auth",
            v: MobileE2EEWireContract.version,
            deviceToken: deviceToken,
            transcriptHashB64: schedule.transcriptHash.base64EncodedString()
        )
        try await socket.send(.string(try cipher.sealText(encodedText(auth))))

        let response = try cipher.openText(try await receivePlaintext(over: socket))
        let capabilities = try validateAuthentication(
            response,
            transcriptHash: schedule.transcriptHash
        )
        return AuthenticatedRuntimeConnection(
            socket: socket,
            cipher: cipher,
            capabilities: capabilities
        )
    }

    func sendText(_ plaintext: String) async throws {
        guard !isClosed else { throw AuthenticatedRuntimeError.closed }
        try await socket.send(.string(try cipher.sealText(plaintext)))
    }

    func sendBinary(_ plaintext: Data) async throws {
        guard !isClosed else { throw AuthenticatedRuntimeError.closed }
        try await socket.send(.data(try cipher.sealBinary(plaintext)))
    }

    func receive() async throws -> AuthenticatedRuntimeMessage {
        guard !isClosed else { throw AuthenticatedRuntimeError.closed }
        switch try await socket.receive() {
        case .string(let frame):
            return .text(try cipher.openText(frame))
        case .data(let frame):
            return .binary(try cipher.openBinary(frame))
        @unknown default:
            throw AuthenticatedRuntimeError.unexpectedMessage
        }
    }

    func ping() async throws {
        guard !isClosed else { throw AuthenticatedRuntimeError.closed }
        let result = PingResult()
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in
            result.store(continuation)
            socket.sendPing { [result] error in
                result.resume(with: error)
            }
        }
    }

    func isOpen() -> Bool {
        !isClosed && socket.state == .running
    }

    func close(code: Int = 1001, reason: String? = nil) {
        guard !isClosed else { return }
        isClosed = true
        let closeCode = URLSessionWebSocketTask.CloseCode(rawValue: code) ?? .goingAway
        let closeReason = reason.map { Data($0.utf8.prefix(123)) }
        socket.cancel(with: closeCode, reason: closeReason)
    }

    private static func sendPlaintext<Value: Encodable>(
        _ value: Value,
        over socket: URLSessionWebSocketTask
    ) async throws {
        try await socket.send(.string(try encodedText(value)))
    }

    private static func receivePlaintext(over socket: URLSessionWebSocketTask) async throws
        -> String
    {
        switch try await socket.receive() {
        case .string(let text):
            return text
        case .data:
            throw AuthenticatedRuntimeError.unexpectedMessage
        @unknown default:
            throw AuthenticatedRuntimeError.unexpectedMessage
        }
    }
}

nonisolated enum AuthenticatedRuntimeMessage: Sendable {
    case text(String)
    case binary(Data)
}

nonisolated enum AuthenticatedRuntimeError: Error {
    case invalidEndpoint
    case invalidDesktopKey
    case unexpectedMessage
    case authenticationFailed
    case closed
    case timeout
}

nonisolated private struct MobileE2EEAuthFrame: Encodable {
    let type: String
    let v: Int
    let deviceToken: String
    let transcriptHashB64: String
}

nonisolated private func encodedText<Value: Encodable>(_ value: Value) throws -> String {
    let data = try JSONEncoder().encode(value)
    guard let text = String(data: data, encoding: .utf8) else {
        throw MobileE2EEError.invalidHandshake
    }
    return text
}

nonisolated private func validateAuthentication(_ text: String, transcriptHash: Data) throws
    -> Set<String>
{
    let data = Data(text.utf8)
    guard let object = try? JSONSerialization.jsonObject(with: data),
        let frame = object as? [String: Any]
    else {
        throw AuthenticatedRuntimeError.authenticationFailed
    }
    if frame["type"] as? String == "e2ee_error" {
        throw AuthenticatedRuntimeError.authenticationFailed
    }
    let required: Set<String> = ["type", "v", "transcriptHashB64"]
    let optional: Set<String> = ["runtimeId", "capabilities"]
    guard required.isSubset(of: frame.keys),
        Set(frame.keys).isSubset(of: required.union(optional)),
        frame["type"] as? String == "e2ee_authenticated",
        frame["v"] as? Int == MobileE2EEWireContract.version,
        frame["transcriptHashB64"] as? String == transcriptHash.base64EncodedString()
    else {
        throw AuthenticatedRuntimeError.unexpectedMessage
    }
    guard let values = frame["capabilities"] else { return [] }
    guard let capabilities = values as? [String], capabilities.count <= 32,
        capabilities.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 64 })
    else {
        throw AuthenticatedRuntimeError.unexpectedMessage
    }
    return Set(capabilities)
}

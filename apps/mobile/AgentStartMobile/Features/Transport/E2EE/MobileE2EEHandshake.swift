import Foundation

nonisolated struct MobileE2EEHandshake: Sendable {
    let hello: MobileE2EEHelloWire
    let ready: MobileE2EEReadyWire
    let clientPublicKey: Data
    let desktopPublicKey: Data
    let clientNonce: Data
    let desktopNonce: Data

    static func makeHello(publicKey: Data, clientNonce: Data) throws -> MobileE2EEHelloWire {
        guard publicKey.count == 32, clientNonce.count == 32 else {
            throw MobileE2EEError.invalidKeyMaterial
        }
        return MobileE2EEHelloWire(
            type: MobileE2EEWireContract.helloType,
            v: MobileE2EEWireContract.version,
            clientPublicKeyB64: publicKey.base64EncodedString(),
            clientNonceB64: clientNonce.base64EncodedString(),
            capabilities: MobileE2EECapabilitiesWire(
                framing: [MobileE2EEWireContract.framing],
                payloadKinds: [.text, .binary]
            ),
            context: directContext
        )
    }

    static func validateReady(
        _ data: Data,
        hello: MobileE2EEHelloWire,
        pinnedDesktopPublicKey: Data
    ) throws -> MobileE2EEHandshake {
        try validateReadyShape(data)
        let ready: MobileE2EEReadyWire
        do {
            ready = try JSONDecoder().decode(MobileE2EEReadyWire.self, from: data)
        } catch {
            throw MobileE2EEError.invalidHandshake
        }
        guard
            ready.type == MobileE2EEWireContract.readyType,
            ready.v == MobileE2EEWireContract.version,
            ready.clientNonceB64 == hello.clientNonceB64,
            ready.selection.framing == MobileE2EEWireContract.framing,
            ready.selection.payloadKinds == [.text, .binary],
            ready.context == hello.context,
            let clientPublicKey = canonical32ByteBase64(hello.clientPublicKeyB64),
            let clientNonce = canonical32ByteBase64(hello.clientNonceB64),
            let desktopPublicKey = canonical32ByteBase64(ready.desktopPublicKeyB64),
            let desktopNonce = canonical32ByteBase64(ready.desktopNonceB64),
            desktopPublicKey == pinnedDesktopPublicKey
        else {
            throw MobileE2EEError.invalidHandshake
        }
        return MobileE2EEHandshake(
            hello: hello,
            ready: ready,
            clientPublicKey: clientPublicKey,
            desktopPublicKey: desktopPublicKey,
            clientNonce: clientNonce,
            desktopNonce: desktopNonce
        )
    }

    func transcript() throws -> Data {
        let fields: [(String, Data)] = [
            ("domain", utf8(MobileE2EEWireContract.transcriptDomain)),
            ("mobile-to-desktop.type", utf8(hello.type)),
            ("mobile-to-desktop.version", uint32(hello.v)),
            ("mobile-to-desktop.client-public-key", clientPublicKey),
            ("mobile-to-desktop.client-nonce", clientNonce),
            ("mobile-to-desktop.capabilities.framing", numberList(hello.capabilities.framing)),
            (
                "mobile-to-desktop.capabilities.payload-kinds",
                stringList(hello.capabilities.payloadKinds.map(\.rawValue))
            ),
            ("mobile-to-desktop.context.protocol", utf8(hello.context.protocolName)),
            ("mobile-to-desktop.context.initiator", utf8(hello.context.initiator)),
            ("mobile-to-desktop.context.responder", utf8(hello.context.responder)),
            ("mobile-to-desktop.context.transport", utf8(hello.context.transport)),
            ("desktop-to-mobile.type", utf8(ready.type)),
            ("desktop-to-mobile.version", uint32(ready.v)),
            ("desktop-to-mobile.desktop-public-key", desktopPublicKey),
            ("desktop-to-mobile.client-nonce-echo", clientNonce),
            ("desktop-to-mobile.desktop-nonce", desktopNonce),
            ("desktop-to-mobile.selection.framing", uint32(ready.selection.framing)),
            (
                "desktop-to-mobile.selection.payload-kinds",
                stringList(ready.selection.payloadKinds.map(\.rawValue))
            ),
            ("desktop-to-mobile.context.protocol", utf8(ready.context.protocolName)),
            ("desktop-to-mobile.context.initiator", utf8(ready.context.initiator)),
            ("desktop-to-mobile.context.responder", utf8(ready.context.responder)),
            ("desktop-to-mobile.context.transport", utf8(ready.context.transport)),
        ]
        var output = Data()
        for (name, value) in fields {
            let nameData = utf8(name)
            output.append(try length(nameData.count))
            output.append(nameData)
            output.append(try length(value.count))
            output.append(value)
        }
        return output
    }

    private static let directContext = MobileE2EEContextWire(
        protocolName: MobileE2EEWireContract.protocolName,
        initiator: MobileE2EEWireContract.initiator,
        responder: MobileE2EEWireContract.responder,
        transport: MobileE2EEWireContract.directTransport
    )

    private static func validateReadyShape(_ data: Data) throws {
        guard let object = try? JSONSerialization.jsonObject(with: data),
            let ready = object as? [String: Any],
            Set(ready.keys)
                == [
                    "type", "v", "desktopPublicKeyB64", "clientNonceB64", "desktopNonceB64",
                    "selection", "context",
                ],
            let selection = ready["selection"] as? [String: Any],
            Set(selection.keys) == ["framing", "payloadKinds"],
            let context = ready["context"] as? [String: Any],
            Set(context.keys) == ["protocol", "initiator", "responder", "transport"]
        else {
            throw MobileE2EEError.invalidHandshake
        }
    }
}

nonisolated private func canonical32ByteBase64(_ value: String) -> Data? {
    guard let data = Data(base64Encoded: value), data.count == 32,
        data.base64EncodedString() == value
    else {
        return nil
    }
    return data
}

nonisolated private func utf8(_ value: String) -> Data {
    Data(value.utf8)
}

nonisolated private func uint32(_ value: Int) -> Data {
    var bigEndian = UInt32(value).bigEndian
    return Data(bytes: &bigEndian, count: MemoryLayout<UInt32>.size)
}

nonisolated private func length(_ value: Int) throws -> Data {
    guard let exact = UInt32(exactly: value) else { throw MobileE2EEError.invalidTranscript }
    var bigEndian = exact.bigEndian
    return Data(bytes: &bigEndian, count: MemoryLayout<UInt32>.size)
}

nonisolated private func numberList(_ values: [Int]) -> Data {
    var output = uint32(values.count)
    values.forEach { output.append(uint32($0)) }
    return output
}

nonisolated private func stringList(_ values: [String]) -> Data {
    var output = uint32(values.count)
    for value in values {
        let data = utf8(value)
        output.append(uint32(data.count))
        output.append(data)
    }
    return output
}

nonisolated enum MobileE2EEError: Error {
    case invalidKeyMaterial
    case invalidHandshake
    case invalidTranscript
    case cryptographyFailed
    case invalidFrame
    case exhaustedCounter
}

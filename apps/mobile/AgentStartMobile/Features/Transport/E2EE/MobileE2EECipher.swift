import Foundation
import Sodium

nonisolated struct MobileE2EECipher: Sendable {
    private let outboundKey: Data
    private let inboundKey: Data
    private let sessionID: Data
    private var outboundCounter: UInt64 = 0
    private var inboundCounter: UInt64 = 0

    init(schedule: MobileE2EEKeySchedule) {
        outboundKey = schedule.mobileToDesktopKey
        inboundKey = schedule.desktopToMobileKey
        sessionID = schedule.sessionID
    }

    mutating func sealText(_ plaintext: String) throws -> String {
        let frame = try seal(Data(plaintext.utf8), kind: .text, counter: outboundCounter)
        guard outboundCounter < UInt64.max else { throw MobileE2EEError.exhaustedCounter }
        outboundCounter += 1
        return frame.base64EncodedString()
    }

    mutating func openText(_ frameBase64: String) throws -> String {
        guard let frame = Data(base64Encoded: frameBase64),
            frame.base64EncodedString() == frameBase64
        else {
            throw MobileE2EEError.invalidFrame
        }
        let plaintext = try open(frame, kind: .text, counter: inboundCounter)
        guard inboundCounter < UInt64.max else { throw MobileE2EEError.exhaustedCounter }
        inboundCounter += 1
        guard let text = String(data: plaintext, encoding: .utf8) else {
            throw MobileE2EEError.invalidFrame
        }
        return text
    }

    mutating func sealBinary(_ plaintext: Data) throws -> Data {
        let frame = try seal(plaintext, kind: .binary, counter: outboundCounter)
        guard outboundCounter < UInt64.max else { throw MobileE2EEError.exhaustedCounter }
        outboundCounter += 1
        return frame
    }

    mutating func openBinary(_ frame: Data) throws -> Data {
        let plaintext = try open(frame, kind: .binary, counter: inboundCounter)
        guard inboundCounter < UInt64.max else { throw MobileE2EEError.exhaustedCounter }
        inboundCounter += 1
        return plaintext
    }

    private func seal(_ payload: Data, kind: MobileE2EEPayloadKindWire, counter: UInt64) throws
        -> Data
    {
        let nonce = try makeNonce(direction: 0, kind: kind, counter: counter)
        let header = try makeHeader(direction: 0, kind: kind, counter: counter)
        guard
            let ciphertext = Sodium().secretBox.seal(
                message: Array(header + payload),
                secretKey: Array(outboundKey),
                nonce: Array(nonce)
            )
        else {
            throw MobileE2EEError.cryptographyFailed
        }
        return nonce + Data(ciphertext)
    }

    private func open(_ frame: Data, kind: MobileE2EEPayloadKindWire, counter: UInt64) throws
        -> Data
    {
        let nonceLength = 24
        let headerLength = 42
        guard frame.count >= nonceLength + 16 + headerLength else {
            throw MobileE2EEError.invalidFrame
        }
        let nonce = frame.prefix(nonceLength)
        let expectedNonce = try makeNonce(direction: 1, kind: kind, counter: counter)
        guard constantTimeEqual(Data(nonce), expectedNonce) else {
            throw MobileE2EEError.invalidFrame
        }
        guard
            let plaintext = Sodium().secretBox.open(
                authenticatedCipherText: Array(frame.dropFirst(nonceLength)),
                secretKey: Array(inboundKey),
                nonce: Array(nonce)
            )
        else {
            throw MobileE2EEError.invalidFrame
        }
        let data = Data(plaintext)
        let expectedHeader = try makeHeader(direction: 1, kind: kind, counter: counter)
        guard data.count >= headerLength,
            constantTimeEqual(data.prefix(headerLength), expectedHeader)
        else {
            throw MobileE2EEError.invalidFrame
        }
        return Data(data.dropFirst(headerLength))
    }

    private func makeHeader(
        direction: UInt8, kind: MobileE2EEPayloadKindWire, counter: UInt64
    ) throws -> Data {
        guard sessionID.count == 32 else { throw MobileE2EEError.invalidKeyMaterial }
        var header = sessionID
        header.append(direction)
        header.append(kind == .text ? 0 : 1)
        header.append(counter.bigEndianData)
        return header
    }

    private func makeNonce(
        direction: UInt8, kind: MobileE2EEPayloadKindWire, counter: UInt64
    ) throws -> Data {
        guard sessionID.count == 32 else { throw MobileE2EEError.invalidKeyMaterial }
        var nonce = Data(sessionID.prefix(12))
        nonce.append(UInt8(MobileE2EEWireContract.version))
        nonce.append(direction)
        nonce.append(kind == .text ? 0 : 1)
        nonce.append(0)
        nonce.append(counter.bigEndianData)
        return nonce
    }
}

nonisolated private extension UInt64 {
    var bigEndianData: Data {
        var value = bigEndian
        return Data(bytes: &value, count: MemoryLayout<UInt64>.size)
    }
}

nonisolated private func constantTimeEqual(_ left: Data, _ right: Data) -> Bool {
    guard left.count == right.count else { return false }
    return zip(left, right).reduce(UInt8(0)) { difference, pair in
        difference | (pair.0 ^ pair.1)
    } == 0
}

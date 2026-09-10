import Foundation
import Sodium

nonisolated struct SodiumKeyPair: Sendable {
    let publicKey: Data
    let secretKey: Data
}

nonisolated enum SodiumKeyExchange {
    static func makeKeyPair() throws -> SodiumKeyPair {
        guard let keyPair = Sodium().box.keyPair() else {
            throw MobileE2EEError.cryptographyFailed
        }
        return SodiumKeyPair(publicKey: Data(keyPair.publicKey), secretKey: Data(keyPair.secretKey))
    }

    static func randomBytes(count: Int) throws -> Data {
        guard let bytes = Sodium().randomBytes.buf(length: count) else {
            throw MobileE2EEError.cryptographyFailed
        }
        return Data(bytes)
    }

    static func sharedSecret(secretKey: Data, desktopPublicKey: Data) throws -> Data {
        guard
            let shared = Sodium().box.beforenm(
                recipientPublicKey: Array(desktopPublicKey),
                senderSecretKey: Array(secretKey)
            )
        else {
            throw MobileE2EEError.cryptographyFailed
        }
        return Data(shared)
    }
}

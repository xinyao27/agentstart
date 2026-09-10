import CryptoKit
import Foundation

nonisolated struct MobileE2EEKeySchedule: Sendable {
    let mobileToDesktopKey: Data
    let desktopToMobileKey: Data
    let sessionID: Data
    let transcriptHash: Data

    static func derive(
        sharedSecret: Data,
        transcript: Data,
        clientNonce: Data,
        desktopNonce: Data
    ) throws -> MobileE2EEKeySchedule {
        guard sharedSecret.count == 32, clientNonce.count == 32, desktopNonce.count == 32 else {
            throw MobileE2EEError.invalidKeyMaterial
        }
        let transcriptHash = Data(SHA256.hash(data: transcript))
        let saltLabel = Data("\(MobileE2EEWireContract.kdfDomain)/salt\0".utf8)
        let infoLabel = Data("\(MobileE2EEWireContract.kdfDomain)/session\0".utf8)
        let salt = Data(SHA256.hash(data: saltLabel + clientNonce + desktopNonce))
        let info = infoLabel + transcriptHash
        let expandedKey = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: sharedSecret),
            salt: salt,
            info: info,
            outputByteCount: 96
        )
        let expanded = expandedKey.withUnsafeBytes { Data($0) }
        return MobileE2EEKeySchedule(
            mobileToDesktopKey: expanded.subdata(in: 0..<32),
            desktopToMobileKey: expanded.subdata(in: 32..<64),
            sessionID: expanded.subdata(in: 64..<96),
            transcriptHash: transcriptHash
        )
    }
}

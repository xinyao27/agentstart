import Foundation

nonisolated enum WorkspaceBrowserFrameDecoder {
    private static let headerBytes = 16

    static func decode(_ data: Data) -> WorkspaceBrowserFrame? {
        guard data.count >= headerBytes,
            data[data.startIndex] == 0x62,
            data[data.startIndex + 1] == 1,
            data[data.startIndex + 2] == 1,
            let format = format(data[data.startIndex + 3])
        else { return nil }
        let sequence = readUInt32(data, at: 4)
        let metadataLength = Int(readUInt32(data, at: 8))
        guard readUInt32(data, at: 12) == 0 else { return nil }
        let imageOffset = headerBytes + metadataLength
        guard metadataLength >= 0, imageOffset <= data.count else { return nil }
        let metadataRange = data.startIndex + headerBytes..<data.startIndex + imageOffset
        guard
            let metadata = try? JSONDecoder().decode(
                WorkspaceBrowserFrameMetadata.self,
                from: data.subdata(in: metadataRange)
            )
        else { return nil }
        return WorkspaceBrowserFrame(
            sequence: sequence,
            format: format,
            metadata: metadata,
            image: data.subdata(in: data.startIndex + imageOffset..<data.endIndex)
        )
    }

    private static func format(_ byte: UInt8) -> String? {
        switch byte {
        case 1: "jpeg"
        case 2: "png"
        default: nil
        }
    }

    private static func readUInt32(_ data: Data, at offset: Int) -> UInt32 {
        data.withUnsafeBytes { bytes in
            UInt32(littleEndian: bytes.loadUnaligned(fromByteOffset: offset, as: UInt32.self))
        }
    }
}

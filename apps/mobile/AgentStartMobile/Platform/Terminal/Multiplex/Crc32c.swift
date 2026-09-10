import Foundation

nonisolated enum TerminalMultiplexCrc32c {
    private static let table: [UInt32] = (0..<256).map { byte in
        (0..<8).reduce(UInt32(byte)) { value, _ in
            value & 1 == 1 ? (value >> 1) ^ TerminalMultiplexCrc32cWire.polynomial : value >> 1
        }
    }

    static func checksum(_ chunks: [Data]) -> UInt32 {
        let crc = chunks.reduce(UInt32.max) { partial, chunk in
            chunk.reduce(partial) { value, byte in
                (value >> 8) ^ table[Int((value ^ UInt32(byte)) & 0xFF)]
            }
        }
        return crc ^ UInt32.max
    }
}

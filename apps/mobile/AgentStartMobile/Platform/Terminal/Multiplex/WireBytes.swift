import Foundation

nonisolated enum TerminalWireBytes {
    static func byte(in data: Data, at offset: Int) -> UInt8 {
        data[data.startIndex + offset]
    }

    static func uint16(in data: Data, at offset: Int) -> UInt16 {
        UInt16(byte(in: data, at: offset)) | UInt16(byte(in: data, at: offset + 1)) << 8
    }

    static func uint32(in data: Data, at offset: Int) -> UInt32 {
        (0..<4).reduce(0) { value, byteOffset in
            value | UInt32(byte(in: data, at: offset + byteOffset)) << UInt32(byteOffset * 8)
        }
    }

    static func uint64(in data: Data, at offset: Int) -> UInt64 {
        (0..<8).reduce(0) { value, byteOffset in
            value | UInt64(byte(in: data, at: offset + byteOffset)) << UInt64(byteOffset * 8)
        }
    }

    static func write(_ value: UInt16, to data: inout Data, at offset: Int) {
        for byteOffset in 0..<2 {
            data[offset + byteOffset] = UInt8(
                truncatingIfNeeded: value >> UInt16(byteOffset * 8)
            )
        }
    }

    static func write(_ value: UInt32, to data: inout Data, at offset: Int) {
        for byteOffset in 0..<4 {
            data[offset + byteOffset] = UInt8(
                truncatingIfNeeded: value >> UInt32(byteOffset * 8)
            )
        }
    }

    static func write(_ value: UInt64, to data: inout Data, at offset: Int) {
        for byteOffset in 0..<8 {
            data[offset + byteOffset] = UInt8(
                truncatingIfNeeded: value >> UInt64(byteOffset * 8)
            )
        }
    }
}

import Foundation

nonisolated struct TerminalMultiplexSnapshotStartRecord: Equatable, Sendable {
    let snapshotID: UInt32
    let reason: UInt8
    let source: UInt8
    let activeBuffer: UInt8
    let isTruncated: Bool
    let isByteBudgetLimited: Bool
    let isColdRestore: Bool
    let columns: UInt16
    let rows: UInt16
    let retainedScrollbackRows: UInt32
    let coverageEndSequence: UInt64
    let pendingDeliveryStartSequence: UInt64
    let sectionByteCounts: [UInt32]
}

nonisolated struct TerminalMultiplexSnapshotChunkRecord: Equatable, Sendable {
    let snapshotID: UInt32
    let section: UInt8
    let sectionOffset: UInt32
    let data: Data
}

nonisolated struct TerminalMultiplexSnapshotEndRecord: Equatable, Sendable {
    let snapshotID: UInt32
    let status: UInt8
    let coverageEndSequence: UInt64
    let assembledBytes: UInt32
    let crc32c: UInt32
}

nonisolated enum TerminalMultiplexSnapshotRecordError: Error, Equatable, Sendable {
    case invalidStart
    case invalidChunk
    case invalidEnd
}

nonisolated enum TerminalMultiplexSnapshotRecordCodec {
    static let chunkDataBytes = TerminalMultiplexSnapshotChunkRecordWire.maxDataBytes

    static func decodeStart(_ data: Data) throws -> TerminalMultiplexSnapshotStartRecord {
        let wire = TerminalMultiplexSnapshotStartRecordWire.self
        guard data.count == wire.bytes else {
            throw TerminalMultiplexSnapshotRecordError.invalidStart
        }
        let reason = TerminalWireBytes.byte(in: data, at: wire.reasonOffset)
        let source = TerminalWireBytes.byte(in: data, at: wire.sourceOffset)
        let activeBuffer = TerminalWireBytes.byte(in: data, at: wire.activeBufferOffset)
        let flags = TerminalWireBytes.byte(in: data, at: wire.flagsOffset)
        let columns = TerminalWireBytes.uint16(in: data, at: wire.colsOffset)
        let rows = TerminalWireBytes.uint16(in: data, at: wire.rowsOffset)
        let coverage = TerminalWireBytes.uint64(in: data, at: wire.coverageEndSeqOffset)
        let pendingDelivery = TerminalWireBytes.uint64(
            in: data,
            at: wire.pendingDeliveryStartSeqOffset
        )
        guard Int(reason) <= wire.reasonMax, Int(source) <= wire.sourceMax,
            Int(activeBuffer) <= wire.activeBufferMax, Int(flags) & ~wire.flagsMask == 0,
            (wire.colsMin...wire.colsMax).contains(Int(columns)),
            (wire.rowsMin...wire.rowsMax).contains(Int(rows)),
            TerminalWireBytes.uint64(in: data, at: wire.reserved64Offset) == 0,
            pendingDelivery <= coverage,
            TerminalWireBytes.uint32(in: data, at: wire.reserved32Offset) == 0
        else {
            throw TerminalMultiplexSnapshotRecordError.invalidStart
        }
        return TerminalMultiplexSnapshotStartRecord(
            snapshotID: TerminalWireBytes.uint32(in: data, at: wire.snapshotIdOffset),
            reason: reason,
            source: source,
            activeBuffer: activeBuffer,
            isTruncated: Int(flags) & wire.truncatedFlag != 0,
            isByteBudgetLimited: Int(flags) & wire.byteBudgetFlag != 0,
            isColdRestore: Int(flags) & wire.coldRestoreFlag != 0,
            columns: columns,
            rows: rows,
            retainedScrollbackRows: TerminalWireBytes.uint32(
                in: data,
                at: wire.retainedScrollbackRowsOffset
            ),
            coverageEndSequence: coverage,
            pendingDeliveryStartSequence: pendingDelivery,
            sectionByteCounts: (0..<wire.sectionCount).map {
                TerminalWireBytes.uint32(
                    in: data,
                    at: wire.sectionBytesOffset + $0 * wire.sectionStrideBytes
                )
            }
        )
    }

    static func decodeChunk(_ data: Data) throws -> TerminalMultiplexSnapshotChunkRecord {
        let wire = TerminalMultiplexSnapshotChunkRecordWire.self
        guard data.count >= wire.headerBytes else {
            throw TerminalMultiplexSnapshotRecordError.invalidChunk
        }
        let section = TerminalWireBytes.byte(in: data, at: wire.sectionOffset)
        let byteCount = Int(TerminalWireBytes.uint32(in: data, at: wire.dataBytesOffset))
        guard Int(section) <= wire.sectionMax,
            TerminalWireBytes.byte(in: data, at: wire.reserved8Offset) == 0,
            TerminalWireBytes.uint16(in: data, at: wire.reserved16Offset) == 0,
            byteCount == data.count - wire.headerBytes,
            byteCount <= chunkDataBytes
        else {
            throw TerminalMultiplexSnapshotRecordError.invalidChunk
        }
        return TerminalMultiplexSnapshotChunkRecord(
            snapshotID: TerminalWireBytes.uint32(in: data, at: wire.snapshotIdOffset),
            section: section,
            sectionOffset: TerminalWireBytes.uint32(in: data, at: wire.dataOffsetOffset),
            data: data.subdata(in: wire.headerBytes..<data.count)
        )
    }

    static func decodeEnd(_ data: Data) throws -> TerminalMultiplexSnapshotEndRecord {
        let wire = TerminalMultiplexSnapshotEndRecordWire.self
        guard data.count == wire.bytes,
            Int(TerminalWireBytes.byte(in: data, at: wire.statusOffset)) <= wire.statusMax,
            TerminalWireBytes.byte(in: data, at: wire.reserved8Offset) == 0,
            TerminalWireBytes.uint16(in: data, at: wire.reserved16Offset) == 0
        else {
            throw TerminalMultiplexSnapshotRecordError.invalidEnd
        }
        return TerminalMultiplexSnapshotEndRecord(
            snapshotID: TerminalWireBytes.uint32(in: data, at: wire.snapshotIdOffset),
            status: TerminalWireBytes.byte(in: data, at: wire.statusOffset),
            coverageEndSequence: TerminalWireBytes.uint64(
                in: data,
                at: wire.coverageEndSeqOffset
            ),
            assembledBytes: TerminalWireBytes.uint32(
                in: data,
                at: wire.assembledBytesOffset
            ),
            crc32c: TerminalWireBytes.uint32(in: data, at: wire.crc32cOffset)
        )
    }
}

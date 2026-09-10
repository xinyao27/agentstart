import Foundation

nonisolated enum TerminalMultiplexSnapshotStartRecordWire {
    static let bytes = 64
    static let snapshotIdOffset = 0
    static let reasonOffset = 4
    static let reasonMax = 6
    static let sourceOffset = 5
    static let sourceMax = 1
    static let activeBufferOffset = 6
    static let activeBufferMax = 1
    static let flagsOffset = 7
    static let flagsMask = 7
    static let truncatedFlag = 1
    static let byteBudgetFlag = 2
    static let coldRestoreFlag = 4
    static let colsOffset = 8
    static let colsMin = 1
    static let colsMax = 1000
    static let rowsOffset = 10
    static let rowsMin = 1
    static let rowsMax = 500
    static let retainedScrollbackRowsOffset = 12
    static let reserved64Offset = 16
    static let coverageEndSeqOffset = 24
    static let pendingDeliveryStartSeqOffset = 32
    static let sectionBytesOffset = 40
    static let sectionCount = 5
    static let sectionStrideBytes = 4
    static let reserved32Offset = 60
}

nonisolated enum TerminalMultiplexSnapshotChunkRecordWire {
    static let headerBytes = 16
    static let snapshotIdOffset = 0
    static let sectionOffset = 4
    static let sectionMax = 4
    static let reserved8Offset = 5
    static let reserved16Offset = 6
    static let dataOffsetOffset = 8
    static let dataBytesOffset = 12
    static let maxDataBytes = 49152
}

nonisolated enum TerminalMultiplexSnapshotEndRecordWire {
    static let bytes = 24
    static let snapshotIdOffset = 0
    static let statusOffset = 4
    static let statusMax = 3
    static let reserved8Offset = 5
    static let reserved16Offset = 6
    static let coverageEndSeqOffset = 8
    static let assembledBytesOffset = 16
    static let crc32cOffset = 20
}

nonisolated enum TerminalMultiplexCrc32cWire {
    static let polynomial: UInt32 = 2197175160
}

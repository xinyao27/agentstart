import Foundation

nonisolated enum TerminalSnapshotAssemblerError: Error, Equatable, Sendable {
    case invalidStart
    case chunkMismatch
    case superseded
    case unavailable(status: UInt8)
    case endMismatch
    case checksumMismatch
    case invalidText
    case invalidMetadata
}

nonisolated struct TerminalSnapshotAssembler: Sendable {
    static let maxBytes = 2 * 1024 * 1024
    private static let supersededStatus: UInt8 = 3

    private var startRecord: TerminalMultiplexSnapshotStartRecord?
    private var sections: [Data]?
    private var sectionOffsets = [Int](repeating: 0, count: 5)

    mutating func start(_ frame: TerminalMultiplexFrame) throws {
        let record = try TerminalMultiplexSnapshotRecordCodec.decodeStart(frame.payload)
        let byteCounts = record.sectionByteCounts.map(Int.init)
        guard record.snapshotID != 0,
            record.snapshotID == frame.correlationID,
            record.coverageEndSequence == frame.sequence,
            byteCounts.count == 5,
            byteCounts.allSatisfy({ $0 <= Self.maxBytes }),
            byteCounts.reduce(0, +) <= Self.maxBytes
        else {
            throw TerminalSnapshotAssemblerError.invalidStart
        }
        startRecord = record
        sections = byteCounts.map { Data(repeating: 0, count: $0) }
        sectionOffsets = [Int](repeating: 0, count: 5)
    }

    mutating func append(_ frame: TerminalMultiplexFrame) throws {
        let record = try TerminalMultiplexSnapshotRecordCodec.decodeChunk(frame.payload)
        guard let startRecord, var sections else {
            throw TerminalSnapshotAssemblerError.chunkMismatch
        }
        let section = Int(record.section)
        let offset = Int(record.sectionOffset)
        let end = offset + record.data.count
        guard record.snapshotID == startRecord.snapshotID,
            frame.correlationID == startRecord.snapshotID,
            frame.sequence == startRecord.coverageEndSequence,
            offset == sectionOffsets[section],
            end <= sections[section].count
        else {
            throw TerminalSnapshotAssemblerError.chunkMismatch
        }
        sections[section].replaceSubrange(offset..<end, with: record.data)
        sectionOffsets[section] = end
        self.sections = sections
    }

    mutating func finish(_ frame: TerminalMultiplexFrame) throws -> TerminalReplaySnapshot {
        defer { clear() }
        let end = try TerminalMultiplexSnapshotRecordCodec.decodeEnd(frame.payload)
        if end.status == Self.supersededStatus {
            throw TerminalSnapshotAssemblerError.superseded
        }
        guard end.status == 0 else {
            throw TerminalSnapshotAssemblerError.unavailable(status: end.status)
        }
        guard let startRecord, let sections,
            end.snapshotID == startRecord.snapshotID,
            frame.correlationID == startRecord.snapshotID,
            end.coverageEndSequence == startRecord.coverageEndSequence,
            frame.sequence == startRecord.coverageEndSequence,
            sections.indices.allSatisfy({ sections[$0].count == sectionOffsets[$0] }),
            sections.reduce(0, { $0 + $1.count }) == Int(end.assembledBytes)
        else {
            throw TerminalSnapshotAssemblerError.endMismatch
        }
        guard TerminalMultiplexCrc32c.checksum(sections) == end.crc32c else {
            throw TerminalSnapshotAssemblerError.checksumMismatch
        }
        guard sections.allSatisfy({ String(data: $0, encoding: .utf8) != nil }) else {
            throw TerminalSnapshotAssemblerError.invalidText
        }
        let metadata = try decodeMetadata(sections[4])
        return TerminalReplaySnapshot(
            id: startRecord.snapshotID,
            columns: Int(startRecord.columns),
            rows: Int(startRecord.rows),
            activeBuffer: startRecord.activeBuffer == 0 ? .normal : .alternate,
            normalScrollback: sections[0],
            normalScreen: sections[1],
            alternateScreen: sections[2],
            pendingEscapeTail: sections[3],
            coverageEndSequence: startRecord.coverageEndSequence,
            pendingDeliveryStartSequence: startRecord.pendingDeliveryStartSequence,
            wireByteLength: end.assembledBytes,
            retainedScrollbackRows: startRecord.retainedScrollbackRows,
            isTruncated: startRecord.isTruncated,
            isByteBudgetLimited: startRecord.isByteBudgetLimited,
            isColdRestore: startRecord.isColdRestore,
            source: startRecord.source == 0 ? .headless : .provider,
            metadata: metadata
        )
    }

    mutating func clear() {
        startRecord = nil
        sections = nil
        sectionOffsets = [Int](repeating: 0, count: 5)
    }

    private func decodeMetadata(_ data: Data) throws -> TerminalSnapshotMetadata {
        let wire: TerminalSnapshotMetadataWire
        do {
            wire = try JSONDecoder().decode(TerminalSnapshotMetadataWire.self, from: data)
        } catch {
            throw TerminalSnapshotAssemblerError.invalidMetadata
        }
        return TerminalSnapshotMetadata(
            currentDirectory: wire.cwd,
            lastTitle: wire.lastTitle,
            links: wire.oscLinks.map {
                TerminalSnapshotLink(uri: $0.uri, start: $0.start, end: $0.end)
            },
            kittyKeyboardFlags: wire.kittyKeyboardFlags,
            displayMode: wire.displayMode,
            requestedScrollbackRows: wire.requestedScrollbackRows
        )
    }
}

nonisolated private struct TerminalSnapshotMetadataWire: Decodable {
    let cwd: String?
    let lastTitle: String?
    let oscLinks: [TerminalSnapshotLinkWire]
    let kittyKeyboardFlags: UInt32
    let displayMode: TerminalDisplayMode
    let requestedScrollbackRows: UInt32

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard container.contains(.cwd), container.contains(.lastTitle) else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Missing nullable metadata")
            )
        }
        cwd = try container.decodeIfPresent(String.self, forKey: .cwd)
        lastTitle = try container.decodeIfPresent(String.self, forKey: .lastTitle)
        oscLinks = try container.decode([TerminalSnapshotLinkWire].self, forKey: .oscLinks)
        kittyKeyboardFlags = try container.decode(UInt32.self, forKey: .kittyKeyboardFlags)
        displayMode = try container.decode(TerminalDisplayMode.self, forKey: .displayMode)
        requestedScrollbackRows = try container.decode(
            UInt32.self,
            forKey: .requestedScrollbackRows
        )
    }

    private enum CodingKeys: String, CodingKey {
        case cwd
        case lastTitle
        case oscLinks
        case kittyKeyboardFlags
        case displayMode
        case requestedScrollbackRows
    }
}

nonisolated private struct TerminalSnapshotLinkWire: Decodable {
    let uri: String
    let start: UInt32
    let end: UInt32
}

extension TerminalDisplayMode: Decodable {}

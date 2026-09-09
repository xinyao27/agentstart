import Foundation

nonisolated enum TerminalSnapshotActiveBuffer: Equatable, Sendable {
    case normal
    case alternate
}

nonisolated enum TerminalSnapshotSource: Equatable, Sendable {
    case headless
    case provider
}

nonisolated struct TerminalSnapshotLink: Equatable, Sendable {
    let uri: String
    let start: UInt32
    let end: UInt32
}

nonisolated struct TerminalSnapshotMetadata: Equatable, Sendable {
    let currentDirectory: String?
    let lastTitle: String?
    let links: [TerminalSnapshotLink]
    let kittyKeyboardFlags: UInt32
    let displayMode: TerminalDisplayMode
    let requestedScrollbackRows: UInt32
}

nonisolated struct TerminalReplaySnapshot: Equatable, Sendable {
    let id: UInt32
    let columns: Int
    let rows: Int
    let activeBuffer: TerminalSnapshotActiveBuffer
    let normalScrollback: Data
    let normalScreen: Data
    let alternateScreen: Data
    let pendingEscapeTail: Data
    let coverageEndSequence: UInt64
    let pendingDeliveryStartSequence: UInt64
    let wireByteLength: UInt32
    let retainedScrollbackRows: UInt32
    let isTruncated: Bool
    let isByteBudgetLimited: Bool
    let isColdRestore: Bool
    let source: TerminalSnapshotSource
    let metadata: TerminalSnapshotMetadata

    var replayBytes: Data {
        // Why: 1049 would restore an uninitialized saved cursor and disable autowrap after reset.
        var replay = Data("\u{001B}[?1047l\u{001B}[2J\u{001B}[3J\u{001B}[H".utf8)
        replay.append(normalScrollback)
        replay.append(normalScreen)
        replay.append(Data("\u{001B}[?1049h\u{001B}[2J\u{001B}[H".utf8))
        replay.append(alternateScreen)
        if activeBuffer == .normal {
            replay.append(Data("\u{001B}[?1049l".utf8))
        }
        replay.append(Data("\u{001B}[0m".utf8))
        // Why: the next live output may complete this partial parser sequence.
        replay.append(pendingEscapeTail)
        return replay
    }
}

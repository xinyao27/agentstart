import Foundation

nonisolated struct TerminalWorkspaceSnapshotGate: Sendable {
    private(set) var epoch: String?
    private(set) var version: Int64 = -1

    mutating func accepts(epoch incomingEpoch: String, version incomingVersion: Int64) -> Bool {
        if incomingEpoch == epoch, incomingVersion < version {
            return false
        }
        epoch = incomingEpoch
        version = incomingVersion
        return true
    }
}

nonisolated func confirmsWorkspaceSelection(publicationEpoch: String) -> Bool {
    !publicationEpoch.hasPrefix("mobile-local:")
}

import Foundation

extension RuntimeClient: TerminalAutoRestoreRepository {
    func terminalAutoRestoreFit(for hostID: String) async throws -> TimeInterval? {
        try await protocolTerminalAutoRestoreFit(hostID: hostID)
    }

    func setTerminalAutoRestoreFit(
        for hostID: String,
        milliseconds: TimeInterval?
    ) async throws -> TimeInterval? {
        try await protocolSetTerminalAutoRestoreFit(hostID: hostID, milliseconds: milliseconds)
    }
}

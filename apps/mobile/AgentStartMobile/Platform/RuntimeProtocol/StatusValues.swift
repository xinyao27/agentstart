import Foundation

nonisolated struct MobileRuntimeStatusWire: Codable, Equatable, Sendable {
    let runtimeId: String
    let runtimeProtocolVersion: Int?
    let minCompatibleRuntimeClientVersion: Int?
    let capabilities: [String]?
    let hostPlatform: String?
    let terminalWindowsShell: String?
    let protocolVersion: Int?
    let minCompatibleMobileVersion: Int?
}
